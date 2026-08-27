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
    TimeProvider? timeProvider = null,
    YouTubeWebSubSubscriptionState? subscriptionState = null) : BackgroundService
{
    private readonly TimeProvider _time = timeProvider ?? TimeProvider.System;
    private readonly YouTubeWebSubSubscriptionState _subscriptions = subscriptionState ?? new();

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
        if (!string.IsNullOrEmpty(youtube.WebhookSecret) &&
            _subscriptions.ShouldRequestSubscription(channelId, now))
        {
            var request = _subscriptions.BeginSubscription(channelId, now);
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
            }
            catch (Exception ex)
            {
                _subscriptions.MarkRequestFailed(request);
                logger.LogWarning(ex, "YouTube WebSub subscribe failed; will retry next tick.");
            }
        }

        YouTubeLiveResult? live = null;
        var current = broadcaster.Current.YouTube;
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
            broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, live.VideoId) });
        }
        else
        {
            var latest = broadcaster.Current.YouTube;
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
                broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(false, null) });
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
