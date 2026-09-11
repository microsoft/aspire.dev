using Microsoft.Extensions.Options;

namespace StaticHost.Live.YouTube;

/// <summary>
/// Background worker that:
/// <list type="bullet">
///   <item>Resolves the YouTube channel id from the configured handle (cached).</item>
///   <item>Subscribes/renews the PubSubHubbub topic from its verified lease.</item>
///   <item>Uses low-cost <c>videos.list</c> checks while live and rate-limits
///     <c>search.list</c> discovery polls while offline.</item>
/// </list>
/// Missing API key ⇒ logs once and exits cleanly.
/// </summary>
/// <remarks>Creates the service.</remarks>
public sealed class YouTubeWebSubService(
    IYouTubeClient client,
    LiveStatusBroadcaster broadcaster,
    IOptionsMonitor<LiveStatusOptions> options,
    ILogger<YouTubeWebSubService> logger,
    TimeProvider timeProvider,
    IYouTubeWebSubSubscriptionState subscriptionState,
    ILiveStatusCoordination coordination) : BackgroundService
{
    private readonly TimeProvider _time = timeProvider;
    private readonly IYouTubeWebSubSubscriptionState _subscriptions = subscriptionState;
    private readonly ILiveStatusCoordination _coordination = coordination;

    private DateTimeOffset _nextDiscoveryPollAt = DateTimeOffset.MinValue;
    private int _consecutiveOfflinePolls;
    private string? _offlineConfirmationVideoId;
    private string? _resolvedChannelHandle;
    private string? _resolvedChannelId;

    /// <inheritdoc/>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.CurrentValue.YouTube.IsConfigured)
        {
            logger.LogWarning("YouTube ApiKey not configured; YouTubeWebSubService idle.");
            return;
        }

        await _coordination.RunAsLeaderAsync(
            LiveStatusRedisKeys.YouTubeLeader,
            RunLeaderAsync,
            stoppingToken).ConfigureAwait(false);
    }

    private async Task RunLeaderAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(3), _time, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                logger.LogError(ex, "YouTube WebSub tick failed; will retry.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(options.CurrentValue.YouTube.PollingIntervalSeconds),
                    _time, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { return; }
        }
    }

    internal async Task TickAsync(CancellationToken cancellationToken)
    {
        var opts = options.CurrentValue;
        var youtube = opts.YouTube;

        var channelId = youtube.ChannelId;
        if (string.IsNullOrEmpty(channelId))
        {
            if (!string.Equals(_resolvedChannelHandle, youtube.ChannelHandle, StringComparison.OrdinalIgnoreCase))
            {
                _resolvedChannelId = null;
                _resolvedChannelHandle = youtube.ChannelHandle;
            }

            channelId = _resolvedChannelId ?? "";
            if (string.IsNullOrEmpty(channelId))
            {
                channelId = await client.ResolveChannelIdAsync(youtube.ChannelHandle, cancellationToken).ConfigureAwait(false) ?? "";
            }

            if (string.IsNullOrEmpty(channelId))
            {
                logger.LogWarning("Could not resolve YouTube channel id for {Handle}.", youtube.ChannelHandle);
                return;
            }

            _resolvedChannelId = channelId;
        }

        var now = _time.GetUtcNow();
        var request = !string.IsNullOrEmpty(youtube.WebhookSecret)
            ? await _subscriptions.TryBeginSubscriptionAsync(
                channelId,
                now,
                cancellationToken).ConfigureAwait(false)
            : null;

        if (request is not null)
        {
            var requestSent = false;
            try
            {
                var callback = $"{opts.PublicBaseUrl.TrimEnd('/')}/api/live/youtube/webhook";
                await client.SubscribeAsync(
                    channelId,
                    callback,
                    youtube.WebhookSecret,
                    request.VerifyToken,
                    TimeSpan.FromDays(5),
                    cancellationToken).ConfigureAwait(false);
                requestSent = true;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                await _subscriptions.MarkRequestFailedAsync(
                    request,
                    CancellationToken.None).ConfigureAwait(false);
                throw;
            }
            catch (Exception ex)
            {
                await _subscriptions.MarkRequestFailedAsync(
                    request,
                    CancellationToken.None).ConfigureAwait(false);
                logger.LogWarning(ex, "YouTube WebSub subscribe failed; will retry next tick.");
            }

            if (requestSent)
            {
                await _subscriptions.MarkRequestSentAsync(
                    request,
                    _time.GetUtcNow(),
                    cancellationToken).ConfigureAwait(false);
            }
        }

        YouTubeLiveResult? live = null;
        var current = (await broadcaster.GetCurrentAsync(cancellationToken).ConfigureAwait(false)).YouTube;
        if (current.Live && !string.IsNullOrEmpty(current.VideoId))
        {
            ResetOfflineConfirmationFor(current.VideoId);
            live = await client.GetVideoLiveStatusAsync(current.VideoId, cancellationToken).ConfigureAwait(false);
        }
        else if (now >= _nextDiscoveryPollAt)
        {
            _nextDiscoveryPollAt = now.AddSeconds(youtube.DiscoveryPollingIntervalSeconds);
            live = await client.GetCurrentLiveAsync(channelId, cancellationToken).ConfigureAwait(false);
        }

        if (live is null)
        {
            return;
        }

        if (live.Live)
        {
            _consecutiveOfflinePolls = 0;
            _offlineConfirmationVideoId = live.VideoId;
            await broadcaster.UpdateAsync(
                new LiveStatusUpdate { YouTube = new YouTubeStatus(true, live.VideoId) },
                cancellationToken).ConfigureAwait(false);
        }
        else
        {
            var latest = (await broadcaster.GetCurrentAsync(cancellationToken).ConfigureAwait(false)).YouTube;
            if (!latest.Live)
            {
                _consecutiveOfflinePolls = 0;
                _offlineConfirmationVideoId = null;
                return;
            }

            if (!string.Equals(_offlineConfirmationVideoId, latest.VideoId, StringComparison.Ordinal))
            {
                _consecutiveOfflinePolls = 0;
                _offlineConfirmationVideoId = latest.VideoId;
                return;
            }

            _consecutiveOfflinePolls++;
            if (_consecutiveOfflinePolls >= youtube.OfflineConfirmationCount)
            {
                await broadcaster.UpdateAsync(
                    new LiveStatusUpdate { YouTube = new YouTubeStatus(false, null) },
                    cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private void ResetOfflineConfirmationFor(string videoId)
    {
        if (string.Equals(_offlineConfirmationVideoId, videoId, StringComparison.Ordinal))
        {
            return;
        }

        _offlineConfirmationVideoId = videoId;
        _consecutiveOfflinePolls = 0;
    }
}
