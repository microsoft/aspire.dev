using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace StaticHost.Live.Twitch;

/// <summary>
/// Background worker that:
/// <list type="bullet">
///   <item>Resolves the Twitch channel id (cached).</item>
///   <item>Seeds initial live state via Helix <c>/streams</c>.</item>
///   <item>Ensures EventSub subscriptions for <c>stream.online</c> and <c>stream.offline</c>
///     exist for our channel id with our callback.</item>
///   <item>Re-reconciles every <see cref="TwitchOptions.ReconcileIntervalSeconds"/>.</item>
/// </list>
/// Missing client id / secret ⇒ logs once and exits cleanly without crashing the host.
/// </summary>
public sealed class TwitchEventSubService : BackgroundService
{
    private readonly ITwitchClient _client;
    private readonly LiveStatusBroadcaster _broadcaster;
    private readonly IOptionsMonitor<LiveStatusOptions> _options;
    private readonly ILogger<TwitchEventSubService> _logger;
    private readonly TimeProvider _time;

    /// <summary>Creates the service.</summary>
    public TwitchEventSubService(
        ITwitchClient client,
        LiveStatusBroadcaster broadcaster,
        IOptionsMonitor<LiveStatusOptions> options,
        ILogger<TwitchEventSubService> logger,
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
        if (!_options.CurrentValue.Twitch.IsConfigured)
        {
            _logger.LogWarning("Twitch ClientId/ClientSecret not configured; TwitchEventSubService idle.");
            return;
        }

        // Initial reconcile after a short delay so the app can finish starting.
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(2), _time, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ReconcileAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Twitch reconcile loop failed; will retry.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.CurrentValue.Twitch.ReconcileIntervalSeconds),
                    _time, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { return; }
        }
    }

    internal async Task ReconcileAsync(CancellationToken cancellationToken)
    {
        var opts = _options.CurrentValue;
        var twitch = opts.Twitch;

        // Resolve channel id if needed.
        var channelId = twitch.ChannelId;
        if (string.IsNullOrEmpty(channelId))
        {
            var user = await _client.GetUserByLoginAsync(twitch.ChannelLogin, cancellationToken).ConfigureAwait(false);
            if (user is null)
            {
                _logger.LogWarning("Twitch user '{Login}' not found.", twitch.ChannelLogin);
                return;
            }
            channelId = user.Id;
        }

        // Re-seed state.
        var stream = await _client.GetStreamAsync(channelId, cancellationToken).ConfigureAwait(false);
        _broadcaster.Update(new LiveStatusUpdate
        {
            Twitch = new TwitchStatus(stream.Live, twitch.ChannelLogin, stream.Title)
        });

        // Ensure subs.
        var callback = $"{opts.PublicBaseUrl.TrimEnd('/')}/api/live/twitch/webhook";
        var existing = await _client.ListEventSubAsync(cancellationToken).ConfigureAwait(false);
        await EnsureSubAsync(existing, "stream.online", channelId, callback, twitch.WebhookSecret, cancellationToken).ConfigureAwait(false);
        await EnsureSubAsync(existing, "stream.offline", channelId, callback, twitch.WebhookSecret, cancellationToken).ConfigureAwait(false);

        // Drop stale subs (different callback or revoked).
        foreach (var sub in existing)
        {
            var stale = sub.Type is "stream.online" or "stream.offline"
                && (!string.Equals(sub.CallbackUrl, callback, StringComparison.OrdinalIgnoreCase)
                    || sub.Status is "authorization_revoked" or "user_removed" or "notification_failures_exceeded");
            if (stale)
            {
                try { await _client.DeleteEventSubAsync(sub.Id, cancellationToken).ConfigureAwait(false); }
                catch (Exception ex) { _logger.LogDebug(ex, "Failed to delete stale Twitch EventSub {Id}", sub.Id); }
            }
        }
    }

    private async Task EnsureSubAsync(IReadOnlyList<TwitchEventSubSubscription> existing, string type, string channelId, string callback, string secret, CancellationToken cancellationToken)
    {
        var found = existing.FirstOrDefault(s => s.Type == type
            && string.Equals(s.CallbackUrl, callback, StringComparison.OrdinalIgnoreCase)
            && s.Status is "enabled" or "webhook_callback_verification_pending");
        if (found is not null) return;

        var condition = $"{{\"broadcaster_user_id\":\"{channelId}\"}}";
        await _client.CreateEventSubAsync(type, condition, callback, secret, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Created Twitch EventSub subscription for {Type}", type);
    }
}
