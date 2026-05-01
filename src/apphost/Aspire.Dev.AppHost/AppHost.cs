using System.Security.Cryptography;
using System.Text;

var builder = DistributedApplication.CreateBuilder(args);

var staticHostWebsite = builder.AddProject<Projects.StaticHost>("aspiredev")
    .WithExternalHttpEndpoints();

if (builder.ExecutionContext.IsRunMode)
{
    var liveDevCommandSecret = builder.AddParameter("live-dev-command-secret", LiveDevCommands.NewSecret, secret: true);
    var liveDevTwitchWebhookSecret = builder.AddParameter("live-dev-twitch-webhook-secret", LiveDevCommands.NewSecret, secret: true);
    var liveDevYouTubeWebhookSecret = builder.AddParameter("live-dev-youtube-webhook-secret", LiveDevCommands.NewSecret, secret: true);

    staticHostWebsite
        // Local AppHost runs are the explicit live-status dev mode: external providers stay idle
        // when no API credentials are configured, but dashboard commands can still exercise the
        // UI and webhook paths with per-run local-only signing secrets.
        .WithEnvironment("Live__EnableDevEndpoint", "true")
        .WithEnvironment("Live__DevCommandSecret", liveDevCommandSecret)
        .WithEnvironment("Live__Twitch__WebhookSecret", liveDevTwitchWebhookSecret)
        .WithEnvironment("Live__YouTube__WebhookSecret", liveDevYouTubeWebhookSecret)
        .WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (StaticHost)")
        .WithUrls(ctx =>
        {
            if (ctx.Resource is not IResourceWithEndpoints withEndpoints)
            {
                return;
            }

            var endpoint = withEndpoints.GetEndpoint("http");
            if (endpoint is null)
            {
                return;
            }

            ctx.Urls.Add(new() { Url = "/api/live", DisplayText = "Live status (JSON)", Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/api/live/stream", DisplayText = "Live status (SSE stream)", Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/api/live/twitch/webhook", DisplayText = "Twitch EventSub webhook (POST)", Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/api/live/youtube/webhook", DisplayText = "YouTube WebSub webhook (GET/POST)", Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/api/live/_dev/set", DisplayText = "Live dev override", Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/scalar/v1", DisplayText = "API reference (Scalar)", Endpoint = endpoint });
        })
        .WithHttpCommand(
            path: "/api/live/_dev/set",
            displayName: "Live: all offline",
            endpointName: "http",
            commandName: "live-dev-all-offline",
            commandOptions: LiveDevCommands.SetStatus(
                liveDevCommandSecret,
                "Turns off both local live-status sources.",
                """
                {
                  "twitch": { "live": false, "channel": null, "title": null },
                  "youtube": { "live": false, "videoId": null }
                }
                """,
                iconName: "LiveOff"))
        .WithHttpCommand(
            path: "/api/live/twitch/webhook",
            displayName: "Simulate Twitch online webhook",
            endpointName: "http",
            commandName: "live-dev-twitch-online-webhook",
            commandOptions: LiveDevCommands.TwitchWebhook(
                liveDevCommandSecret,
                liveDevTwitchWebhookSecret,
                "Sends a signed stream.online notification to the local Twitch EventSub endpoint.",
                "stream.online"))
        .WithHttpCommand(
            path: "/api/live/twitch/webhook",
            displayName: "Simulate Twitch offline webhook",
            endpointName: "http",
            commandName: "live-dev-twitch-offline-webhook",
            commandOptions: LiveDevCommands.TwitchWebhook(
                liveDevCommandSecret,
                liveDevTwitchWebhookSecret,
                "Sends a signed stream.offline notification to the local Twitch EventSub endpoint.",
                "stream.offline"))
        .WithHttpCommand(
            path: "/api/live/youtube/webhook",
            displayName: "Simulate YouTube WebSub webhook",
            endpointName: "http",
            commandName: "live-dev-youtube-websub-webhook",
            commandOptions: LiveDevCommands.YouTubeWebhook(
                liveDevCommandSecret,
                liveDevYouTubeWebhookSecret,
                "Sends a signed Atom notification to the local YouTube WebSub endpoint. In dev mode without a YouTube API key, the payload directly sets YouTube live.",
                videoId: "dev-live-video"))
        .WithHttpCommand(
            path: "/api/live/_dev/set",
            displayName: "Live: YouTube offline",
            endpointName: "http",
            commandName: "live-dev-youtube-offline",
            commandOptions: LiveDevCommands.SetStatus(
                liveDevCommandSecret,
                "Turns off only the local YouTube live-status source.",
                """
                {
                  "youtube": { "live": false, "videoId": null }
                }
                """,
                iconName: "VideoOff"))
        .WithHttpCommand(
            path: "/api/live/_dev/set",
            displayName: "Live: both online",
            endpointName: "http",
            commandName: "live-dev-both-online",
            commandOptions: LiveDevCommands.SetStatus(
                liveDevCommandSecret,
                "Turns on both local live-status sources without going through provider webhook validation.",
                """
                {
                  "twitch": { "live": true, "channel": "aspiredotdev", "title": "Local dashboard test" },
                  "youtube": { "live": true, "videoId": "dev-live-video" }
                }
                """,
                iconName: "Live"));

    // For local development: Use ViteApp for hot reload and development experience
    builder.AddViteApp("frontend", "../../frontend")
           .WithPnpm()
           .WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (Local)")
           .WithExternalHttpEndpoints();
}
else
{
    // For deployment: We want to pick ACA as the environment to publish to.
    var appService = builder.AddAzureAppServiceEnvironment("production");

    builder.AddAzureFrontDoor("frontdoor", staticHostWebsite);
}

builder.Build().Run();

internal static class LiveDevCommands
{
    public const string CommandSecretHeaderName = "X-Aspire-Live-Dev-Command-Key";

    public static string NewSecret() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

    public static HttpCommandOptions SetStatus(
        IResourceBuilder<ParameterResource> commandSecret,
        string description,
        string body,
        string iconName,
        bool isHighlighted = false) =>
        new()
        {
            Method = HttpMethod.Post,
            Description = description,
            IconName = iconName,
            IconVariant = IconVariant.Regular,
            IsHighlighted = isHighlighted,
            PrepareRequest = async context =>
            {
                await AddCommandSecretAsync(context, commandSecret).ConfigureAwait(false);
                context.Request.Content = Json(body, "application/json");
            },
        };

    public static HttpCommandOptions TwitchWebhook(
        IResourceBuilder<ParameterResource> commandSecret,
        IResourceBuilder<ParameterResource> webhookSecret,
        string description,
        string subscriptionType) =>
        new()
        {
            Method = HttpMethod.Post,
            Description = description,
            IconName = subscriptionType == "stream.online" ? "PlugConnected" : "PlugDisconnected",
            IconVariant = IconVariant.Regular,
            PrepareRequest = async context =>
            {
                var body = $$"""
                {
                  "subscription": { "type": "{{subscriptionType}}" },
                  "event": {
                    "broadcaster_user_id": "dev-aspire",
                    "broadcaster_user_login": "aspiredotdev",
                    "broadcaster_user_name": "Aspire",
                    "started_at": "{{DateTimeOffset.UtcNow:O}}"
                  }
                }
                """;

                var messageId = Guid.NewGuid().ToString("N");
                var timestamp = DateTimeOffset.UtcNow.ToString("O");
                var bodyBytes = Encoding.UTF8.GetBytes(body);
                var secret = await GetRequiredSecretAsync(webhookSecret, context.CancellationToken).ConfigureAwait(false);
                var signature = SignTwitch(secret, messageId, timestamp, bodyBytes);

                await AddCommandSecretAsync(context, commandSecret).ConfigureAwait(false);
                context.Request.Headers.Add("Twitch-Eventsub-Message-Id", messageId);
                context.Request.Headers.Add("Twitch-Eventsub-Message-Timestamp", timestamp);
                context.Request.Headers.Add("Twitch-Eventsub-Message-Type", "notification");
                context.Request.Headers.Add("Twitch-Eventsub-Message-Signature", $"sha256={signature}");
                context.Request.Content = Json(body, "application/json");
            },
        };

    public static HttpCommandOptions YouTubeWebhook(
        IResourceBuilder<ParameterResource> commandSecret,
        IResourceBuilder<ParameterResource> webhookSecret,
        string description,
        string videoId) =>
        new()
        {
            Method = HttpMethod.Post,
            Description = description,
            IconName = "ArrowSync",
            IconVariant = IconVariant.Regular,
            PrepareRequest = async context =>
            {
                var body = $$"""
                <?xml version="1.0" encoding="UTF-8"?>
                <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
                  <entry>
                    <yt:videoId>{{videoId}}</yt:videoId>
                    <title>Local Aspire live-status test</title>
                    <link rel="alternate" href="https://www.youtube.com/watch?v={{videoId}}" />
                  </entry>
                </feed>
                """;

                var bodyBytes = Encoding.UTF8.GetBytes(body);
                var secret = await GetRequiredSecretAsync(webhookSecret, context.CancellationToken).ConfigureAwait(false);
                var signature = SignYouTube(secret, bodyBytes);
                await AddCommandSecretAsync(context, commandSecret).ConfigureAwait(false);
                context.Request.Headers.Add("X-Hub-Signature", $"sha1={signature}");
                context.Request.Content = Json(body, "application/atom+xml");
            },
        };

    private static async Task AddCommandSecretAsync(
        HttpCommandRequestContext context,
        IResourceBuilder<ParameterResource> commandSecret)
    {
        var secret = await GetRequiredSecretAsync(commandSecret, context.CancellationToken).ConfigureAwait(false);
        context.Request.Headers.Add(CommandSecretHeaderName, $"Key: {secret}");
    }

    private static async ValueTask<string> GetRequiredSecretAsync(
        IResourceBuilder<ParameterResource> parameter,
        CancellationToken cancellationToken)
    {
        var value = await parameter.Resource.GetValueAsync(cancellationToken).ConfigureAwait(false);
        return string.IsNullOrEmpty(value)
            ? throw new InvalidOperationException($"Required parameter '{parameter.Resource.Name}' did not produce a value.")
            : value;
    }

    private static StringContent Json(string body, string mediaType) =>
        new(body, Encoding.UTF8, mediaType);

    private static string SignTwitch(string secret, string messageId, string timestamp, byte[] body)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var messageBytes = Encoding.UTF8.GetBytes(messageId);
        hmac.TransformBlock(messageBytes, 0, messageBytes.Length, null, 0);
        var timestampBytes = Encoding.UTF8.GetBytes(timestamp);
        hmac.TransformBlock(timestampBytes, 0, timestampBytes.Length, null, 0);
        hmac.TransformFinalBlock(body, 0, body.Length);
        return Convert.ToHexStringLower(hmac.Hash!);
    }

    private static string SignYouTube(string secret, byte[] body)
    {
        using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexStringLower(hmac.ComputeHash(body));
    }
}
