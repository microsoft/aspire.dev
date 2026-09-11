using System.Text.Json;
using StackExchange.Redis;

namespace StaticHost.Live;

/// <summary>Reads and atomically updates the canonical live-status state.</summary>
public interface ILiveStatusStore
{
    ValueTask<LiveStatusState> GetAsync(CancellationToken cancellationToken = default);

    ValueTask<LiveStatusState> UpdateAsync(
        LiveStatusUpdate update,
        CancellationToken cancellationToken = default);
}

internal sealed class RedisLiveStatusStore(
    ILiveStatusRedis redis,
    TimeProvider timeProvider,
    ILogger<RedisLiveStatusStore> logger) : ILiveStatusStore
{
    public async ValueTask<LiveStatusState> GetAsync(CancellationToken cancellationToken = default)
    {
        var payload = await redis.GetAsync(
            LiveStatusRedisKeys.State,
            cancellationToken).ConfigureAwait(false);

        if (!payload.IsNull)
        {
            return Deserialize(payload);
        }

        var initial = LiveStatusState.CreateInitial();
        var initialPayload = Serialize(initial);
        var exchange = await redis.CompareExchangeAsync(
            LiveStatusRedisKeys.State,
            RedisValue.Null,
            initialPayload,
            cancellationToken).ConfigureAwait(false);

        if (exchange.Succeeded)
        {
            return initial;
        }

        logger.LogDebug(
            "Another worker initialized the canonical live status first.");
        return Deserialize(exchange.Current);
    }

    public async ValueTask<LiveStatusState> UpdateAsync(
        LiveStatusUpdate update,
        CancellationToken cancellationToken = default)
    {
        var payload = await redis.GetAsync(
            LiveStatusRedisKeys.State,
            cancellationToken).ConfigureAwait(false);

        for (var attempt = 1; attempt <= RedisOptimisticConcurrency.MaxAttempts; attempt++)
        {
            var current = payload.IsNull
                ? LiveStatusState.CreateInitial()
                : Deserialize(payload);
            var snapshot = LiveStatusReducer.Apply(
                current.Snapshot,
                update,
                timeProvider.GetUtcNow());
            var changed = snapshot != current.Snapshot;

            if (!changed && !payload.IsNull)
            {
                return current;
            }

            var next = changed
                ? new LiveStatusState(
                    current.Epoch,
                    current.Version + 1,
                    snapshot)
                : current;
            var nextPayload = Serialize(next);
            var exchange = await redis.CompareExchangeAsync(
                LiveStatusRedisKeys.State,
                payload,
                nextPayload,
                cancellationToken).ConfigureAwait(false);

            if (exchange.Succeeded)
            {
                if (changed)
                {
                    try
                    {
                        await redis.PublishAsync(
                            RedisChannel.Literal(LiveStatusRedisKeys.UpdatesChannel),
                            nextPayload).ConfigureAwait(false);
                    }
                    catch (RedisException exception)
                    {
                        logger.LogWarning(
                            exception,
                            "Persisted live status version {Version}, but could not publish its update.",
                            next.Version);
                    }
                }

                return next;
            }

            LogContention(attempt);
            payload = exchange.Current;
            if (attempt < RedisOptimisticConcurrency.MaxAttempts)
            {
                await RedisOptimisticConcurrency.DelayAsync(
                    attempt,
                    timeProvider,
                    cancellationToken).ConfigureAwait(false);
            }
        }

        throw CreateConcurrencyException();
    }

    private static LiveStatusState Deserialize(RedisValue payload)
    {
        byte[]? bytes = payload;
        return bytes is null
            ? throw new InvalidOperationException("The distributed live-status state was empty.")
            : JsonSerializer.Deserialize(bytes, LiveStatusJsonContext.Default.LiveStatusState)
                ?? throw new InvalidOperationException("The distributed live-status state was empty.");
    }

    private static byte[] Serialize(LiveStatusState state) =>
        JsonSerializer.SerializeToUtf8Bytes(
            state,
            LiveStatusJsonContext.Default.LiveStatusState);

    private void LogContention(int attempt)
    {
        logger.LogDebug(
            "Live status compare-and-set conflicted on attempt {Attempt} of {MaxAttempts}.",
            attempt,
            RedisOptimisticConcurrency.MaxAttempts);
    }

    private LiveStatusConcurrencyException CreateConcurrencyException()
    {
        logger.LogWarning(
            "Live status compare-and-set did not succeed after {MaxAttempts} attempts.",
            RedisOptimisticConcurrency.MaxAttempts);
        return new LiveStatusConcurrencyException(
            $"Could not update live status after {RedisOptimisticConcurrency.MaxAttempts} compare-and-set attempts.");
    }
}

internal static class LiveStatusReducer
{
    public static LiveStatus Apply(
        LiveStatus current,
        LiveStatusUpdate update,
        DateTimeOffset updatedAt)
    {
        var twitch = update.Twitch ?? current.Twitch;
        var youTube = update.YouTube ?? current.YouTube;
        if (twitch == current.Twitch && youTube == current.YouTube)
        {
            return current;
        }

        var isLive = twitch.Live || youTube.Live;

        return current with
        {
            IsLive = isLive,
            PrimarySource = ResolvePrimary(current.PrimarySource, twitch, youTube),
            Twitch = twitch,
            YouTube = youTube,
            LiveSessionId = ResolveLiveSessionId(current, isLive, updatedAt),
            UpdatedAt = updatedAt,
        };
    }

    private static string? ResolvePrimary(
        string? previous,
        TwitchStatus twitch,
        YouTubeStatus youTube)
    {
        if (previous == "twitch" && twitch.Live)
        {
            return "twitch";
        }

        if (previous == "youtube" && youTube.Live)
        {
            return "youtube";
        }

        if (twitch.Live)
        {
            return "twitch";
        }

        return youTube.Live ? "youtube" : null;
    }

    private static string? ResolveLiveSessionId(
        LiveStatus current,
        bool isLive,
        DateTimeOffset updatedAt)
    {
        if (!isLive)
        {
            return null;
        }

        if (current.IsLive && !string.IsNullOrEmpty(current.LiveSessionId))
        {
            return current.LiveSessionId;
        }

        return $"live-{updatedAt.ToUnixTimeMilliseconds():x}";
    }
}

internal static class LiveStatusRedisKeys
{
    private const string Prefix = "aspiredev:live:";

    public const string State = Prefix + "{state}";
    public const string UpdatesChannel = Prefix + "updates";
    public const string TwitchMessagePrefix = Prefix + "twitch-message:";
    public const string YouTubeConfirmation = Prefix + "youtube-confirmation";
    public const string YouTubeSubscription = Prefix + "{youtube-subscription}";
    public const string TwitchLeader = Prefix + "twitch-leader";
    public const string YouTubeLeader = Prefix + "youtube-leader";
}
