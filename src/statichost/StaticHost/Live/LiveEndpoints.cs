using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using StaticHost.Live.Twitch;
using StaticHost.Live.YouTube;

namespace StaticHost.Live;

/// <summary>
/// Maps the live-status HTTP endpoints onto an <see cref="IEndpointRouteBuilder"/>.
/// </summary>
public static class LiveStatusEndpointRouteBuilderExtensions
{
    private const string DevCommandSecretHeaderName = "X-Aspire-Live-Dev-Command-Key";

    /// <summary>
    /// Maps:
    /// <list type="bullet">
    /// <item><c>GET /api/live</c> — current snapshot as JSON.</item>
    /// <item><c>GET /api/live/stream</c> — Server-Sent Events stream of state changes (with heartbeats).</item>
    /// <item><c>POST /api/live/twitch/webhook</c> — Twitch EventSub callback (challenge + signed notifications).</item>
    /// <item><c>GET /api/live/youtube/webhook</c> — YouTube WebSub (PubSubHubbub) verification handshake.</item>
    /// <item><c>POST /api/live/youtube/webhook</c> — YouTube WebSub Atom notifications (signed).</item>
    /// <item><c>POST /api/live/_dev/set</c> — development-only state override (Playwright + local UX testing).</item>
    /// </list>
    /// All endpoints are tagged <c>"live"</c> for OpenAPI / Scalar discovery.
    /// </summary>
    public static IEndpointRouteBuilder MapLiveStatus(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        var group = endpoints.MapGroup("/api/live")
            .WithTags("live")
            .DisableAntiforgery();

        // Everything under /api/live is per-request dynamic (snapshots, SSE, and the
        // WebSub/EventSub challenge echoes). Mark every response no-store centrally so
        // an edge cache (Azure Front Door) can never serve a stale snapshot or, worse,
        // cache and replay a verification challenge. Individual handlers therefore
        // don't need to remember to set it.
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context).ConfigureAwait(false);
        });

        group.MapGet("", GetSnapshot)
            .WithName("LiveStatusSnapshot")
            .WithSummary("Returns the current live-status snapshot.");

        group.MapGet("stream", StreamSse)
            .WithName("LiveStatusStream")
            .WithSummary("Server-Sent Events stream of live-status changes.");

        group.MapGet("twitch/webhook", TwitchWebhookInfo)
            .WithName("TwitchEventSubWebhookInfo")
            .WithSummary("Describes the Twitch EventSub webhook endpoint. EventSub notifications use POST.");

        group.MapPost("twitch/webhook", TwitchWebhook)
            .WithName("TwitchEventSubWebhook")
            .WithSummary("Twitch EventSub callback (challenge + stream.online/offline notifications).");

        group.MapGet("youtube/webhook", YouTubeVerify)
            .WithName("YouTubeWebSubVerify")
            .WithSummary("WebSub verification handshake.");

        group.MapPost("youtube/webhook", YouTubeWebhook)
            .WithName("YouTubeWebSubWebhook")
            .WithSummary("WebSub Atom notification.");

        group.MapPost("_dev/set", DevSet)
            .WithName("LiveStatusDevSet")
            .WithSummary("Development-only state override. Enabled by AppHost for local dashboard commands.");

        return endpoints;
    }

    private static async Task<IResult> GetSnapshot(
        LiveStatusBroadcaster broadcaster,
        CancellationToken cancellationToken)
    {
        // Cache-Control: no-store is applied to the whole /api/live group by an
        // endpoint filter in MapLiveStatus.
        var snapshot = await broadcaster.GetCurrentAsync(cancellationToken).ConfigureAwait(false);
        return Results.Json(snapshot, LiveStatusJsonContext.Default.LiveStatus,
            statusCode: StatusCodes.Status200OK);
    }

    internal static async Task StreamSse(
        HttpContext context,
        LiveStatusBroadcaster broadcaster,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        await broadcaster.RefreshAsync(cancellationToken).ConfigureAwait(false);

        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.Headers.ContentType = "text/event-stream";
        context.Response.Headers["X-Accel-Buffering"] = "no";
        // Cache-Control: no-store is applied to the whole /api/live group by an
        // endpoint filter in MapLiveStatus.

        // Disable response buffering so events flush immediately.
        var bufferingFeature = context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>();
        bufferingFeature?.DisableBuffering();

        var (reader, unsubscribe) = broadcaster.Subscribe();
        using var _ = unsubscribe;
        using var pending = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        using var heartbeat = new PeriodicTimer(TimeSpan.FromSeconds(15), time);
        var dataReady = reader.WaitToReadAsync(pending.Token).AsTask();
        var heartbeatReady = heartbeat.WaitForNextTickAsync(pending.Token).AsTask();

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                await Task.WhenAny(dataReady, heartbeatReady).ConfigureAwait(false);
                if (dataReady.IsCompleted)
                {
                    if (!await dataReady.ConfigureAwait(false)) break;
                    while (reader.TryRead(out var next))
                    {
                        await context.Response.Body.WriteAsync(next.Frame, cancellationToken).ConfigureAwait(false);
                    }
                    await context.Response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
                    dataReady = reader.WaitToReadAsync(pending.Token).AsTask();
                }
                else
                {
                    if (!await heartbeatReady.ConfigureAwait(false)) break;
                    await context.Response.WriteAsync(":hb\n\n", cancellationToken).ConfigureAwait(false);
                    await context.Response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
                    heartbeatReady = heartbeat.WaitForNextTickAsync(pending.Token).AsTask();
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { /* client disconnected */ }
        finally
        {
            await pending.CancelAsync().ConfigureAwait(false);
            try
            {
                await Task.WhenAll(dataReady, heartbeatReady).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (pending.IsCancellationRequested) { /* pending waits cancelled */ }
        }
    }

    // --- Twitch EventSub ----------------------------------------------------

    private static IResult TwitchWebhookInfo() =>
        Results.Text("Twitch EventSub webhook endpoint. Twitch sends signed notifications with POST.", "text/plain");

    private static async Task<IResult> TwitchWebhook(
        HttpContext context,
        IHostEnvironment env,
        IOptions<LiveStatusOptions> options,
        LiveStatusBroadcaster broadcaster,
        ILiveStatusCoordination coordination,
        TimeProvider time,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger("StaticHost.Live.Twitch.Webhook");
        var liveOptions = options.Value;
        var twitch = liveOptions.Twitch;

        if (string.IsNullOrEmpty(twitch.WebhookSecret))
        {
            logger.LogWarning("Twitch webhook hit but no WebhookSecret is configured; rejecting.");
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        var headers = context.Request.Headers;
        var messageId = headers["Twitch-Eventsub-Message-Id"].ToString();
        var timestamp = headers["Twitch-Eventsub-Message-Timestamp"].ToString();
        var signature = headers["Twitch-Eventsub-Message-Signature"].ToString();
        var messageType = headers["Twitch-Eventsub-Message-Type"].ToString();

        if (string.IsNullOrEmpty(messageId) || string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(signature))
        {
            return Results.BadRequest("Missing Twitch EventSub headers.");
        }

        // Read body once.
        context.Request.EnableBuffering();
        using var ms = new MemoryStream();
        await context.Request.Body.CopyToAsync(ms).ConfigureAwait(false);
        var bodyBytes = ms.ToArray();
        context.Request.Body.Position = 0;

        if (!TwitchWebhookHandler.IsValidSignature(twitch.WebhookSecret, messageId, timestamp, bodyBytes, signature))
        {
            logger.LogWarning("Twitch webhook signature mismatch.");
            return Results.Unauthorized();
        }

        // The signature covers the timestamp, so a valid-but-old message is a replay
        // of a genuinely-signed notification. Reject anything outside a 10 minute
        // window (Twitch itself recommends this) so a captured callback can't be
        // replayed indefinitely.
        if (!TwitchWebhookHandler.IsFresh(timestamp, time.GetUtcNow(), TimeSpan.FromMinutes(10)))
        {
            logger.LogWarning("Twitch webhook timestamp {Timestamp} is stale or unparseable; rejecting.", timestamp);
            return Results.Unauthorized();
        }

        if (RequiresDevCommandSecret(env, liveOptions, twitch.IsConfigured) &&
            !HasValidDevCommandSecret(context, liveOptions))
        {
            logger.LogWarning("Twitch dev webhook command rejected because the dev command secret header was missing or invalid.");
            return Results.Unauthorized();
        }

        // Verification handshakes must echo the challenge every time the hub retries,
        // so never let message-id dedup swallow them; only real notifications dedupe.
        var isVerification = string.Equals(messageType, "webhook_callback_verification", StringComparison.Ordinal);
        ITwitchMessageLease? messageLease = null;
        if (!isVerification)
        {
            var acquisition = await coordination.AcquireTwitchMessageAsync(
                messageId,
                context.RequestAborted).ConfigureAwait(false);

            if (acquisition.Status == TwitchMessageAcquisitionStatus.Completed)
            {
                logger.LogDebug("Twitch webhook replay ignored for {MessageId}.", messageId);
                return Results.Ok();
            }

            if (acquisition.Status == TwitchMessageAcquisitionStatus.Processing)
            {
                logger.LogDebug(
                    "Twitch webhook {MessageId} is already being processed; asking Twitch to retry.",
                    messageId);
                return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
            }

            messageLease = acquisition.Lease
                ?? throw new InvalidOperationException(
                    "An acquired Twitch message did not include its processing lease.");
        }

        await using var ownedMessageLease = messageLease;
        var bodyJson = Encoding.UTF8.GetString(bodyBytes);
        var result = await TwitchWebhookHandler.HandleAsync(
            messageType,
            bodyJson,
            broadcaster,
            twitch,
            logger,
            context.RequestAborted).ConfigureAwait(false);
        if (ownedMessageLease is not null)
        {
            await ownedMessageLease.CompleteAsync().ConfigureAwait(false);
        }
        return result;
    }

    // --- YouTube WebSub -----------------------------------------------------

    private static async Task<IResult> YouTubeVerify(
        HttpContext context,
        IYouTubeWebSubSubscriptionState subscriptions,
        TimeProvider time,
        ILoggerFactory loggerFactory)
    {
        var query = context.Request.Query;
        if (!query.ContainsKey("hub.mode"))
        {
            return Results.Text("YouTube WebSub webhook endpoint. The hub verifies with GET + hub.* query parameters and sends signed notifications with POST.", "text/plain");
        }

        var mode = query["hub.mode"].ToString();
        var topic = query["hub.topic"].ToString();
        var challenge = query["hub.challenge"].ToString();
        var verifyToken = query["hub.verify_token"].ToString();
        var logger = loggerFactory.CreateLogger("StaticHost.Live.YouTube.WebSub");

        if (!int.TryParse(query["hub.lease_seconds"], out var leaseSeconds) ||
            string.IsNullOrEmpty(challenge))
        {
            logger.LogWarning("YouTube WebSub verification omitted the challenge or a valid lease.");
            return Results.BadRequest("Invalid WebSub verification request.");
        }

        if (!YouTubeWebSubSubscriptionTransitions.HasValidConfirmationShape(
                mode,
                topic,
                verifyToken,
                leaseSeconds))
        {
            logger.LogWarning("Rejected malformed YouTube WebSub {Mode} verification for {Topic}.", mode, topic);
            return Results.NotFound();
        }

        if (!await subscriptions.TryConfirmSubscriptionAsync(
                mode,
                topic,
                verifyToken,
                leaseSeconds,
                time.GetUtcNow(),
                context.RequestAborted).ConfigureAwait(false))
        {
            logger.LogWarning("Rejected unexpected YouTube WebSub {Mode} verification for {Topic}.", mode, topic);
            return Results.NotFound();
        }

        return Results.Text(challenge, "text/plain");
    }

    private static async Task<IResult> YouTubeWebhook(
        HttpContext context,
        IOptions<LiveStatusOptions> options,
        LiveStatusBroadcaster broadcaster,
        YouTubeLiveConfirmationQueue confirmationQueue,
        ILiveStatusCoordination coordination,
        IHostEnvironment env,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger("StaticHost.Live.YouTube.Webhook");
        var youtube = options.Value.YouTube;

        if (string.IsNullOrEmpty(youtube.WebhookSecret))
        {
            logger.LogWarning("YouTube webhook hit but no WebhookSecret is configured; rejecting.");
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        context.Request.EnableBuffering();
        using var ms = new MemoryStream();
        await context.Request.Body.CopyToAsync(ms).ConfigureAwait(false);
        var bodyBytes = ms.ToArray();

        var signature = context.Request.Headers["X-Hub-Signature"].ToString();
        if (!YouTubeWebhookHandler.IsValidSignature(youtube.WebhookSecret, bodyBytes, signature))
        {
            logger.LogWarning("YouTube WebSub signature mismatch.");
            return Results.Unauthorized();
        }

        if (env.IsDevelopment() && options.Value.EnableDevEndpoint && !youtube.IsConfigured)
        {
            if (!HasValidDevCommandSecret(context, options.Value))
            {
                logger.LogWarning("YouTube dev webhook command rejected because the dev command secret header was missing or invalid.");
                return Results.Unauthorized();
            }

            var videoId = YouTubeWebhookHandler.ExtractVideoId(bodyBytes);
            await broadcaster.UpdateAsync(
                new LiveStatusUpdate { YouTube = new YouTubeStatus(videoId is not null, videoId) },
                context.RequestAborted).ConfigureAwait(false);
            logger.LogInformation("YouTube dev webhook accepted without API key; videoId={VideoId}", videoId);
            return Results.Ok();
        }

        // Queue a coalesced, host-scoped confirming poll instead of blocking the hub
        // or spawning an untracked Task.Run per notification. The queue collapses a
        // burst of retries into a single Data API call and cancels on shutdown.
        if (await coordination.TryQueueYouTubeConfirmationAsync(
                context.RequestAborted).ConfigureAwait(false))
        {
            confirmationQueue.RequestConfirmation();
        }

        return Results.Ok();
    }

    internal static async Task ConfirmYouTubeLiveStatusAsync(
        YouTubeOptions youtube,
        IYouTubeClient ytClient,
        LiveStatusBroadcaster broadcaster,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        var channelId = youtube.ChannelId;
        if (string.IsNullOrWhiteSpace(channelId))
        {
            channelId = await ytClient.ResolveChannelIdAsync(youtube.ChannelHandle, cancellationToken).ConfigureAwait(false);
        }

        if (string.IsNullOrWhiteSpace(channelId))
        {
            logger.LogWarning("Could not resolve YouTube channel id for webhook confirmation.");
            return;
        }

        var live = await ytClient.GetCurrentLiveAsync(channelId, cancellationToken).ConfigureAwait(false);
        await broadcaster.UpdateAsync(
            new LiveStatusUpdate { YouTube = new YouTubeStatus(live.Live, live.VideoId) },
            cancellationToken).ConfigureAwait(false);
    }

    // --- Dev-only -----------------------------------------------------------

    private static async Task<IResult> DevSet(
        HttpContext context,
        [FromBody] DevSetBody body,
        IHostEnvironment env,
        IOptions<LiveStatusOptions> options,
        LiveStatusBroadcaster broadcaster)
    {
        if (!env.IsDevelopment() || !options.Value.EnableDevEndpoint)
        {
            return Results.NotFound();
        }

        if (!HasValidDevCommandSecret(context, options.Value))
        {
            return Results.Unauthorized();
        }

        var update = new LiveStatusUpdate();
        if (body.Twitch is not null)
        {
            update.Twitch = new TwitchStatus(body.Twitch.Live, body.Twitch.Channel, body.Twitch.Title);
        }
        if (body.YouTube is not null)
        {
            update.YouTube = new YouTubeStatus(body.YouTube.Live, body.YouTube.VideoId);
        }
        var snapshot = await broadcaster.UpdateAsync(
            update,
            context.RequestAborted).ConfigureAwait(false);
        broadcaster.FlushNow();
        return Results.Ok(snapshot);
    }

    /// <summary>Body of the dev-only set endpoint.</summary>
    public sealed record DevSetBody(DevTwitch? Twitch, [property: JsonPropertyName("youtube")] DevYouTube? YouTube);
    /// <summary>Twitch override.</summary>
    public sealed record DevTwitch(bool Live, string? Channel, string? Title);
    /// <summary>YouTube override.</summary>
    public sealed record DevYouTube(bool Live, string? VideoId);

    private static bool RequiresDevCommandSecret(IHostEnvironment env, LiveStatusOptions options, bool providerConfigured) =>
        env.IsDevelopment() && options.EnableDevEndpoint && !providerConfigured;

    private static bool HasValidDevCommandSecret(HttpContext context, LiveStatusOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.DevCommandSecret))
        {
            return false;
        }

        var header = context.Request.Headers[DevCommandSecretHeaderName].ToString();
        const string prefix = "Key: ";
        if (!header.StartsWith(prefix, StringComparison.Ordinal))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(header[prefix.Length..]),
            Encoding.UTF8.GetBytes(options.DevCommandSecret));
    }

}
