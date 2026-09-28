using System.Text.Json;
using System.Threading.Channels;
using StackExchange.Redis;

namespace StaticHost.Live;

internal sealed class LiveStatusSynchronizer(
    IConnectionMultiplexer connectionMultiplexer,
    ILiveStatusStore store,
    LiveStatusBroadcaster broadcaster,
    TimeProvider timeProvider,
    ILogger<LiveStatusSynchronizer> logger) : BackgroundService
{
    private static readonly TimeSpan s_resyncInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan s_subscribeRetryDelay = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var subscriber = connectionMultiplexer.GetSubscriber();
        var redisChannel = RedisChannel.Literal(LiveStatusRedisKeys.UpdatesChannel);
        var messages = Channel.CreateBounded<RedisValue>(new BoundedChannelOptions(16)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
        });
        Action<RedisChannel, RedisValue> handler =
            (_, payload) => messages.Writer.TryWrite(payload);
        var subscribed = false;

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await subscriber.SubscribeAsync(redisChannel, handler).ConfigureAwait(false);
                    subscribed = true;
                    break;
                }
                catch (RedisException exception)
                {
                    logger.LogWarning(
                        exception,
                        "Could not subscribe to live-status updates in Redis; retrying.");
                    await Task.Delay(
                        s_subscribeRetryDelay,
                        timeProvider,
                        stoppingToken).ConfigureAwait(false);
                }
            }

            if (!subscribed)
            {
                return;
            }

            await RefreshAsync(stoppingToken).ConfigureAwait(false);

            using var timer = new PeriodicTimer(s_resyncInterval, timeProvider);
            var messageTask = messages.Reader.ReadAsync(stoppingToken).AsTask();
            var timerTask = timer.WaitForNextTickAsync(stoppingToken).AsTask();

            while (!stoppingToken.IsCancellationRequested)
            {
                var completedTask = await Task.WhenAny(messageTask, timerTask).ConfigureAwait(false);

                if (completedTask == messageTask)
                {
                    await ApplyMessageAsync(
                        await messageTask.ConfigureAwait(false),
                        stoppingToken).ConfigureAwait(false);
                    messageTask = messages.Reader.ReadAsync(stoppingToken).AsTask();
                }
                else
                {
                    if (!await timerTask.ConfigureAwait(false))
                    {
                        break;
                    }

                    await RefreshAsync(stoppingToken).ConfigureAwait(false);
                    timerTask = timer.WaitForNextTickAsync(stoppingToken).AsTask();
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        finally
        {
            if (subscribed)
            {
                try
                {
                    await subscriber.UnsubscribeAsync(redisChannel, handler).ConfigureAwait(false);
                }
                catch (RedisException exception)
                {
                    logger.LogDebug(exception, "Could not unsubscribe from Redis during shutdown.");
                }
                catch (ObjectDisposedException)
                {
                    // The shared multiplexer can be disposed first when host startup fails.
                }
            }
        }
    }

    private async Task ApplyMessageAsync(
        RedisValue payload,
        CancellationToken cancellationToken)
    {
        try
        {
            var state = JsonSerializer.Deserialize(
                (byte[]?)payload,
                LiveStatusJsonContext.Default.LiveStatusState);

            if (state is not null)
            {
                if (!broadcaster.ApplyState(state))
                {
                    await RefreshAsync(cancellationToken).ConfigureAwait(false);
                }
            }
        }
        catch (JsonException exception)
        {
            logger.LogError(exception, "Received an invalid live-status update from Redis.");
        }
    }

    private async Task RefreshAsync(CancellationToken cancellationToken)
    {
        LiveStatusState state;
        try
        {
            state = await store.GetAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (RedisException exception)
        {
            logger.LogWarning(
                exception,
                "Could not reload canonical live status from Redis; retaining the last local snapshot.");
            return;
        }
        catch (JsonException exception)
        {
            logger.LogError(
                exception,
                "Canonical live status in Redis was invalid; retaining the last local snapshot.");
            return;
        }
        catch (InvalidOperationException exception)
        {
            logger.LogError(
                exception,
                "Canonical live status in Redis was invalid; retaining the last local snapshot.");
            return;
        }

        broadcaster.ApplyState(
            state,
            flushImmediately: true,
            allowEpochChange: true);
    }
}
