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
/// <remarks>Creates the service.</remarks>
public sealed class TwitchEventSubService(
    ITwitchClient client,
    LiveStatusBroadcaster broadcaster,
    IOptionsMonitor<LiveStatusOptions> options,
    ILogger<TwitchEventSubService> logger,
    TimeProvider? timeProvider = null) : BackgroundService
{
    private readonly TimeProvider _time = timeProvider ?? TimeProvider.System;
    private string? _resolvedChannelLogin;
    private string? _resolvedChannelId;

    /// <inheritdoc/>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.CurrentValue.Twitch.IsConfigured)
        {
            logger.LogWarning("Twitch ClientId/ClientSecret not configured; TwitchEventSubService idle.");
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
                logger.LogError(ex, "Twitch reconcile loop failed; will retry.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(options.CurrentValue.Twitch.ReconcileIntervalSeconds),
                    _time, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { return; }
        }
    }

    internal async Task ReconcileAsync(CancellationToken cancellationToken)
    {
        var opts = options.CurrentValue;
        var twitch = opts.Twitch;

        // Resolve channel id if needed.
        var channelId = twitch.ChannelId;
        if (string.IsNullOrEmpty(channelId))
        {
            if (!string.Equals(_resolvedChannelLogin, twitch.ChannelLogin, StringComparison.OrdinalIgnoreCase))
            {
                _resolvedChannelId = null;
                _resolvedChannelLogin = twitch.ChannelLogin;
            }

            channelId = _resolvedChannelId ?? "";
            if (string.IsNullOrEmpty(channelId))
            {
                var user = await client.GetUserByLoginAsync(twitch.ChannelLogin, cancellationToken).ConfigureAwait(false);
                if (user is null)
                {
                    logger.LogWarning("Twitch user '{Login}' not found.", twitch.ChannelLogin);
                    return;
                }
                channelId = user.Id;
            }

            _resolvedChannelId = channelId;
        }

        // Re-seed state.
        var stream = await client.GetStreamAsync(channelId, cancellationToken).ConfigureAwait(false);
        broadcaster.Update(new LiveStatusUpdate
        {
            Twitch = new TwitchStatus(stream.Live, twitch.ChannelLogin, stream.Title)
        });

        if (string.IsNullOrWhiteSpace(twitch.WebhookSecret))
        {
            logger.LogWarning("Twitch WebhookSecret not configured; skipping EventSub subscription reconciliation.");
            return;
        }

        // Ensure subs.
        var callback = $"{opts.PublicBaseUrl.TrimEnd('/')}/api/live/twitch/webhook";
        var existing = await client.ListEventSubAsync(cancellationToken).ConfigureAwait(false);

        await EnsureSubAsync(existing, "stream.online", channelId, callback, twitch.WebhookSecret, cancellationToken).ConfigureAwait(false);
        await EnsureSubAsync(existing, "stream.offline", channelId, callback, twitch.WebhookSecret, cancellationToken).ConfigureAwait(false);

        // Drop stale subs (different callback/channel or revoked).
        foreach (var sub in existing)
        {
            var stale = sub.Type is "stream.online" or "stream.offline"
                && (!string.Equals(sub.CallbackUrl, callback, StringComparison.OrdinalIgnoreCase)
                    || !string.Equals(sub.BroadcasterUserId, channelId, StringComparison.Ordinal)
                    || sub.Status is "authorization_revoked" or "user_removed" or "notification_failures_exceeded");
            if (stale)
            {
                try { await client.DeleteEventSubAsync(sub.Id, cancellationToken).ConfigureAwait(false); }
                catch (Exception ex) { logger.LogDebug(ex, "Failed to delete stale Twitch EventSub {Id}", sub.Id); }
            }
        }
    }

    private async Task EnsureSubAsync(IReadOnlyList<TwitchEventSubSubscription> existing, string type, string channelId, string callback, string secret, CancellationToken cancellationToken)
    {
        var found = existing.FirstOrDefault(s => s.Type == type
            && string.Equals(s.CallbackUrl, callback, StringComparison.OrdinalIgnoreCase)
            && string.Equals(s.BroadcasterUserId, channelId, StringComparison.Ordinal)
            && s.Status is "enabled" or "webhook_callback_verification_pending");
        if (found is not null) return;

        var condition = $"{{\"broadcaster_user_id\":\"{channelId}\"}}";
        await client.CreateEventSubAsync(type, condition, callback, secret, cancellationToken).ConfigureAwait(false);
        logger.LogInformation("Created Twitch EventSub subscription for {Type}", type);
    }
}
