using System.Diagnostics;
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
    private string? _resolvedChannelHandle;
    private string? _resolvedChannelId;
    private DateTimeOffset? _lastSuccessfulDiscoveryAt;
    private bool? _lastDiscoveryLive;
    private string? _diagnosticConfiguredChannelId;
    private string? _diagnosticChannelHandle;

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
                YouTubeDiagnostics.LogFailure(logger, ex, "BackgroundTick", "local coordination/state",
                    lastSuccessfulDiscoveryAt: _lastSuccessfulDiscoveryAt, lastDiscoveryLive: _lastDiscoveryLive,
                    skipIfLogged: true);
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

        if (!string.Equals(_diagnosticConfiguredChannelId, youtube.ChannelId, StringComparison.Ordinal) ||
            !string.Equals(_diagnosticChannelHandle, youtube.ChannelHandle, StringComparison.OrdinalIgnoreCase))
        {
            _diagnosticConfiguredChannelId = youtube.ChannelId;
            _diagnosticChannelHandle = youtube.ChannelHandle;
            _lastSuccessfulDiscoveryAt = null;
            _lastDiscoveryLive = null;
        }

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
                channelId = await RunOperationAsync("ChannelResolution", YouTubeDiagnostics.ChannelsEndpoint,
                    () => client.ResolveChannelIdAsync(youtube.ChannelHandle, cancellationToken),
                    cancellationToken).ConfigureAwait(false) ?? "";
                if (!string.IsNullOrEmpty(channelId))
                {
                    logger.LogInformation("YouTube {Operation} succeeded at {CheckedAt}.", "ChannelResolution", _time.GetUtcNow());
                }
            }

            if (string.IsNullOrEmpty(channelId))
            {
                logger.LogWarning("YouTube {Operation} returned no channel; live detection is unavailable, not confirmed offline.",
                    "ChannelResolution");
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
            var started = Stopwatch.GetTimestamp();
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
                // Let the short send reservation expire on shutdown or leadership loss.
                throw;
            }
            catch (Exception ex)
            {
                var elapsedMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
                var retry = await _subscriptions.MarkRequestFailedAsync(
                    request,
                    CancellationToken.None).ConfigureAwait(false);
                YouTubeDiagnostics.LogFailure(logger, ex, "WebSubSubscribe", YouTubeDiagnostics.SubscribeEndpoint,
                    retry, _lastSuccessfulDiscoveryAt, _lastDiscoveryLive, elapsedMs: elapsedMs);
            }

            if (requestSent)
            {
                var elapsedMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
                logger.LogInformation(
                    "YouTube {Operation} accepted at {AcceptedAt} after {ElapsedMs} ms; HTTP acceptance does not establish a verified lease. " +
                    "Only a matching verification callback establishes or renews the subscription.",
                    "WebSubSubscribe", _time.GetUtcNow(), elapsedMs);
                await _subscriptions.MarkRequestSentAsync(
                    request,
                    _time.GetUtcNow(),
                    cancellationToken).ConfigureAwait(false);
            }
        }

        YouTubeLiveResult? live = null;
        var observed = await broadcaster.GetStateAsync(cancellationToken).ConfigureAwait(false);
        var current = observed.Snapshot.YouTube;
        if (current.Live && !string.IsNullOrEmpty(current.VideoId))
        {
            live = await RunOperationAsync("KnownVideoStatus", YouTubeDiagnostics.VideosEndpoint,
                () => client.GetVideoLiveStatusAsync(current.VideoId, cancellationToken),
                cancellationToken).ConfigureAwait(false);
            logger.LogInformation("YouTube {Operation} succeeded at {CheckedAt}; observed live {ObservedLive}.",
                "KnownVideoStatus", _time.GetUtcNow(), live.Live);
        }
        else if (now >= _nextDiscoveryPollAt)
        {
            _nextDiscoveryPollAt = now.AddSeconds(youtube.DiscoveryPollingIntervalSeconds);
            live = await RunOperationAsync("OfflineDiscovery", YouTubeDiagnostics.SearchEndpoint,
                () => client.GetCurrentLiveAsync(channelId, cancellationToken),
                cancellationToken).ConfigureAwait(false);
            _lastSuccessfulDiscoveryAt = _time.GetUtcNow();
            _lastDiscoveryLive = live.Live;
            logger.LogInformation(
                "YouTube {Operation} succeeded; last successful discovery {LastSuccessfulDiscoveryAt}, live {LastDiscoveryLive}. " +
                "Next discovery no earlier than {NextDiscoveryAt}.",
                "OfflineDiscovery", _lastSuccessfulDiscoveryAt, _lastDiscoveryLive, _nextDiscoveryPollAt);
        }

        if (live is null)
        {
            return;
        }

        await broadcaster.UpdateAsync(
            new LiveStatusUpdate
            {
                YouTube = new YouTubeStatus(live.Live, live.Live ? live.VideoId : null),
                YouTubeObservation = new YouTubeObservation(
                    observed.Epoch,
                    observed.YouTubeRevision,
                    youtube.OfflineConfirmationCount),
            },
            cancellationToken).ConfigureAwait(false);
    }

    private async Task<T> RunOperationAsync<T>(
        string operation, string endpoint, Func<Task<T>> action, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            return await action().ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception)
        {
            YouTubeDiagnostics.LogFailure(logger, exception, operation, endpoint,
                lastSuccessfulDiscoveryAt: _lastSuccessfulDiscoveryAt, lastDiscoveryLive: _lastDiscoveryLive,
                elapsedMs: Stopwatch.GetElapsedTime(started).TotalMilliseconds);
            throw;
        }
    }
}
