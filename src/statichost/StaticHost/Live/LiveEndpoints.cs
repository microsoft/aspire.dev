using System.Buffers;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
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

    private static IResult GetSnapshot(LiveStatusBroadcaster broadcaster)
    {
        var snapshot = broadcaster.Current;
        return Results.Json(snapshot, LiveStatusJsonContext.Default.LiveStatus,
            statusCode: StatusCodes.Status200OK);
    }

    private static async Task StreamSse(
        HttpContext context,
        LiveStatusBroadcaster broadcaster,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.Headers.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["X-Accel-Buffering"] = "no";

        // Disable response buffering so events flush immediately.
        var bufferingFeature = context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>();
        bufferingFeature?.DisableBuffering();

        var (reader, unsubscribe) = broadcaster.Subscribe();
        using var _ = unsubscribe;

        using var heartbeat = time.CreateTimer(static _ => { }, null,
            TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(15));

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                using var heartbeatCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                heartbeatCts.CancelAfter(TimeSpan.FromSeconds(15));

                LiveStatus next;
                try
                {
                    next = await reader.ReadAsync(heartbeatCts.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    // Heartbeat tick.
                    await context.Response.WriteAsync(":hb\n\n", cancellationToken).ConfigureAwait(false);
                    await context.Response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
                    continue;
                }

                var json = JsonSerializer.Serialize(next, LiveStatusJsonContext.Default.LiveStatus);
                await context.Response.WriteAsync(
                    $"event: state\ndata: {json}\n\n", cancellationToken).ConfigureAwait(false);
                await context.Response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) { /* client disconnected */ }
    }

    // --- Twitch EventSub ----------------------------------------------------

    // Tiny thread-safe LRU for replay defense (Twitch-Eventsub-Message-Id).
    private static readonly TwitchMessageDedup s_twitchDedup = new(capacity: 1024);

    private static IResult TwitchWebhookInfo() =>
        Results.Text("Twitch EventSub webhook endpoint. Twitch sends signed notifications with POST.", "text/plain");

    private static async Task<IResult> TwitchWebhook(
        HttpContext context,
        IHostEnvironment env,
        IOptions<LiveStatusOptions> options,
        LiveStatusBroadcaster broadcaster,
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

        if (RequiresDevCommandSecret(env, liveOptions, twitch.IsConfigured) &&
            !HasValidDevCommandSecret(context, liveOptions))
        {
            logger.LogWarning("Twitch dev webhook command rejected because the dev command secret header was missing or invalid.");
            return Results.Unauthorized();
        }

        if (!s_twitchDedup.TryRegister(messageId))
        {
            logger.LogDebug("Twitch webhook replay ignored for {MessageId}.", messageId);
            return Results.Ok();
        }

        var bodyJson = Encoding.UTF8.GetString(bodyBytes);
        return TwitchWebhookHandler.Handle(messageType, bodyJson, broadcaster, twitch, logger);
    }

    // --- YouTube WebSub -----------------------------------------------------

    private static IResult YouTubeVerify(HttpContext context, IOptions<LiveStatusOptions> options)
    {
        var query = context.Request.Query;
        if (!query.ContainsKey("hub.mode"))
        {
            return Results.Text("YouTube WebSub webhook endpoint. The hub verifies with GET + hub.* query parameters and sends signed notifications with POST.", "text/plain");
        }

        if (query["hub.mode"] != "subscribe" && query["hub.mode"] != "unsubscribe")
        {
            return Results.BadRequest("Unexpected hub.mode.");
        }

        var topic = query["hub.topic"].ToString();
        var expected = $"https://www.youtube.com/xml/feeds/videos.xml?channel_id={options.Value.YouTube.ChannelId}";
        if (!string.IsNullOrEmpty(options.Value.YouTube.ChannelId) &&
            !string.Equals(topic, expected, StringComparison.OrdinalIgnoreCase))
        {
            return Results.NotFound();
        }

        var challenge = query["hub.challenge"].ToString();
        return Results.Text(challenge, "text/plain");
    }

    private static async Task<IResult> YouTubeWebhook(
        HttpContext context,
        IOptions<LiveStatusOptions> options,
        LiveStatusBroadcaster broadcaster,
        IYouTubeClient ytClient,
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
            broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(videoId is not null, videoId) });
            logger.LogInformation("YouTube dev webhook accepted without API key; videoId={VideoId}", videoId);
            return Results.Ok();
        }

        // Run the confirming poll out of band; we don't want to block the hub.
        _ = Task.Run(async () =>
        {
            try
            {
                var live = await ytClient.GetCurrentLiveAsync(youtube.ChannelId, CancellationToken.None).ConfigureAwait(false);
                broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(live.Live, live.VideoId) });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Confirming poll after YouTube webhook failed.");
            }
        });

        return Results.Ok();
    }

    // --- Dev-only -----------------------------------------------------------

    private static IResult DevSet(
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
        broadcaster.Update(update);
        broadcaster.FlushNow();
        return Results.Ok(broadcaster.Current);
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

    // --- Tiny LRU for Twitch dedup ------------------------------------------

    private sealed class TwitchMessageDedup(int capacity)
    {
        private readonly ConcurrentDictionary<string, byte> _set = new(StringComparer.Ordinal);
        private readonly ConcurrentQueue<string> _order = new();
        private readonly int _capacity = capacity;

        public bool TryRegister(string id)
        {
            if (!_set.TryAdd(id, 0)) return false;
            _order.Enqueue(id);
            while (_order.Count > _capacity && _order.TryDequeue(out var dropped))
            {
                _set.TryRemove(dropped, out _);
            }
            return true;
        }
    }
}
