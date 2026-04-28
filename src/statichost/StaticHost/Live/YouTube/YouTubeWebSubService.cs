using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace StaticHost.Live.YouTube;

/// <summary>
/// Background worker that:
/// <list type="bullet">
///   <item>Resolves the YouTube channel id from the configured handle (cached).</item>
///   <item>Subscribes/renews the PubSubHubbub topic with a 5-day lease, refreshed every 4 days.</item>
///   <item>Polls <c>search.list?eventType=live</c> every <see cref="YouTubeOptions.PollingIntervalSeconds"/>
///     as a fallback for offline detection (PubSubHubbub doesn't reliably notify offline).</item>
/// </list>
/// Missing API key ⇒ logs once and exits cleanly.
/// </summary>
public sealed class YouTubeWebSubService : BackgroundService
{
    private readonly IYouTubeClient _client;
    private readonly LiveStatusBroadcaster _broadcaster;
    private readonly IOptionsMonitor<LiveStatusOptions> _options;
    private readonly ILogger<YouTubeWebSubService> _logger;
    private readonly TimeProvider _time;

    private DateTimeOffset _nextSubscribeAt = DateTimeOffset.MinValue;
    private int _consecutiveOfflinePolls;

    /// <summary>Creates the service.</summary>
    public YouTubeWebSubService(
        IYouTubeClient client,
        LiveStatusBroadcaster broadcaster,
        IOptionsMonitor<LiveStatusOptions> options,
        ILogger<YouTubeWebSubService> logger,
        TimeProvider? timeProvider = null)
    {
        _client = client;
        _broadcaster = broadcaster;
        _options = options;
        _logger = logger;
        _time = timeProvider ?? TimeProvider.System;
    }

    /// <inheritdoc/>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.CurrentValue.YouTube.IsConfigured)
        {
            _logger.LogWarning("YouTube ApiKey not configured; YouTubeWebSubService idle.");
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
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "YouTube WebSub tick failed; will retry.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.CurrentValue.YouTube.PollingIntervalSeconds),
                    _time, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { return; }
        }
    }

    internal async Task TickAsync(CancellationToken cancellationToken)
    {
        var opts = _options.CurrentValue;
        var youtube = opts.YouTube;

        var channelId = youtube.ChannelId;
        if (string.IsNullOrEmpty(channelId))
        {
            channelId = await _client.ResolveChannelIdAsync(youtube.ChannelHandle, cancellationToken).ConfigureAwait(false) ?? "";
            if (string.IsNullOrEmpty(channelId))
            {
                _logger.LogWarning("Could not resolve YouTube channel id for {Handle}.", youtube.ChannelHandle);
                return;
            }
        }

        // Refresh subscription if lease close to expiry.
        var now = _time.GetUtcNow();
        if (now >= _nextSubscribeAt && !string.IsNullOrEmpty(youtube.WebhookSecret))
        {
            try
            {
                var callback = $"{opts.PublicBaseUrl.TrimEnd('/')}/api/live/youtube/webhook";
                await _client.SubscribeAsync(channelId, callback, youtube.WebhookSecret, TimeSpan.FromDays(5), cancellationToken).ConfigureAwait(false);
                _nextSubscribeAt = now.AddDays(4);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "YouTube WebSub subscribe failed; will retry next tick.");
            }
        }

        // Confirming poll for live state.
        var live = await _client.GetCurrentLiveAsync(channelId, cancellationToken).ConfigureAwait(false);
        if (live.Live)
        {
            _consecutiveOfflinePolls = 0;
            _broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, live.VideoId) });
        }
        else
        {
            _consecutiveOfflinePolls++;
            if (_consecutiveOfflinePolls >= youtube.OfflineConfirmationCount)
            {
                _broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(false, null) });
            }
        }
    }
}
