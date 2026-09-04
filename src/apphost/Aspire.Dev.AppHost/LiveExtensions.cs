using System.Security.Cryptography;
using System.Text;

using Azure.Provisioning.KeyVault;

internal static class LiveExtensions
{
    public static IResourceBuilder<ProjectResource> WithProductionLiveStatus(
        this IResourceBuilder<ProjectResource> staticHostWebsite,
        IDistributedApplicationBuilder builder)
    {
        var liveConfig = builder.AddAzureKeyVault("liveconfig");

        var publicBaseUrl = liveConfig.AddSecret(
            "live-public-base-url-secret",
            "live-public-base-url",
            builder.AddParameter("live-public-base-url", "https://aspire.dev", publishValueAsDefault: true));
        var coalesceWindow = liveConfig.AddSecret(
            "live-coalesce-window-ms-secret",
            "live-coalesce-window-ms",
            builder.AddParameter("live-coalesce-window-ms", "750", publishValueAsDefault: true));

        var twitchClientId = liveConfig.AddSecret(
            "live-twitch-client-id-secret",
            "live-twitch-client-id",
            builder.AddParameter("live-twitch-client-id", secret: true));
        var twitchClientSecret = liveConfig.AddSecret(
            "live-twitch-client-secret-secret",
            "live-twitch-client-secret",
            builder.AddParameter("live-twitch-client-secret", secret: true));
        var twitchWebhookSecret = liveConfig.AddSecret(
            "live-twitch-webhook-secret-secret",
            "live-twitch-webhook-secret",
            builder.AddParameter("live-twitch-webhook-secret", secret: true));
        var twitchChannelLogin = liveConfig.AddSecret(
            "live-twitch-channel-login-secret",
            "live-twitch-channel-login",
            builder.AddParameter("live-twitch-channel-login", "aspiredotdev", publishValueAsDefault: true));
        var twitchChannelId = liveConfig.AddSecret(
            "live-twitch-channel-id-secret",
            "live-twitch-channel-id",
            builder.AddParameter("live-twitch-channel-id"));
        var twitchReconcileInterval = liveConfig.AddSecret(
            "live-twitch-reconcile-interval-seconds-secret",
            "live-twitch-reconcile-interval-seconds",
            builder.AddParameter("live-twitch-reconcile-interval-seconds", "1800", publishValueAsDefault: true));

        var youtubeApiKey = liveConfig.AddSecret(
            "live-youtube-api-key-secret",
            "live-youtube-api-key",
            builder.AddParameter("live-youtube-api-key", secret: true));
        var youtubeWebhookSecret = liveConfig.AddSecret(
            "live-youtube-webhook-secret-secret",
            "live-youtube-webhook-secret",
            builder.AddParameter("live-youtube-webhook-secret", secret: true));
        var youtubeChannelHandle = liveConfig.AddSecret(
            "live-youtube-channel-handle-secret",
            "live-youtube-channel-handle",
            builder.AddParameter("live-youtube-channel-handle", "@aspiredotdev", publishValueAsDefault: true));
        var youtubeChannelId = liveConfig.AddSecret(
            "live-youtube-channel-id-secret",
            "live-youtube-channel-id",
            builder.AddParameter("live-youtube-channel-id"));
        var youtubePollingInterval = liveConfig.AddSecret(
            "live-youtube-polling-interval-seconds-secret",
            "live-youtube-polling-interval-seconds",
            builder.AddParameter("live-youtube-polling-interval-seconds", "120", publishValueAsDefault: true));
        var youtubeDiscoveryPollingInterval = liveConfig.AddSecret(
            "live-youtube-discovery-polling-interval-seconds-secret",
            "live-youtube-discovery-polling-interval-seconds",
            builder.AddParameter("live-youtube-discovery-polling-interval-seconds", "1800", publishValueAsDefault: true));
        var youtubeOfflineConfirmationCount = liveConfig.AddSecret(
            "live-youtube-offline-confirmation-count-secret",
            "live-youtube-offline-confirmation-count",
            builder.AddParameter("live-youtube-offline-confirmation-count", "2", publishValueAsDefault: true));

        return staticHostWebsite
            .WithRoleAssignments(liveConfig, KeyVaultBuiltInRole.KeyVaultSecretsUser)
            .WithReference(liveConfig)
            .WithEnvironment("Live__PublicBaseUrl", publicBaseUrl.Resource)
            .WithEnvironment("Live__CoalesceWindowMs", coalesceWindow.Resource)
            .WithEnvironment("Live__Twitch__ClientId", twitchClientId.Resource)
            .WithEnvironment("Live__Twitch__ClientSecret", twitchClientSecret.Resource)
            .WithEnvironment("Live__Twitch__WebhookSecret", twitchWebhookSecret.Resource)
            .WithEnvironment("Live__Twitch__ChannelLogin", twitchChannelLogin.Resource)
            .WithEnvironment("Live__Twitch__ChannelId", twitchChannelId.Resource)
            .WithEnvironment("Live__Twitch__ReconcileIntervalSeconds", twitchReconcileInterval.Resource)
            .WithEnvironment("Live__YouTube__ApiKey", youtubeApiKey.Resource)
            .WithEnvironment("Live__YouTube__WebhookSecret", youtubeWebhookSecret.Resource)
            .WithEnvironment("Live__YouTube__ChannelHandle", youtubeChannelHandle.Resource)
            .WithEnvironment("Live__YouTube__ChannelId", youtubeChannelId.Resource)
            .WithEnvironment("Live__YouTube__PollingIntervalSeconds", youtubePollingInterval.Resource)
            .WithEnvironment("Live__YouTube__DiscoveryPollingIntervalSeconds", youtubeDiscoveryPollingInterval.Resource)
            .WithEnvironment("Live__YouTube__OfflineConfirmationCount", youtubeOfflineConfirmationCount.Resource)
            .PublishAsAzureAppServiceWebsite((_, website) =>
            {
                // Live state and WebSub verification are coordinated in memory.
                website.SiteConfig.NumberOfWorkers = 1;
            });
    }

    public static IResourceBuilder<ProjectResource> WithLocalLiveStatusDevCommands(this IResourceBuilder<ProjectResource> staticHostWebsite)
    {
        var liveDevCommandSecret = LiveDevCommands.NewSecret();
        var liveDevTwitchWebhookSecret = LiveDevCommands.NewSecret();
        var liveDevYouTubeWebhookSecret = LiveDevCommands.NewSecret();

        return staticHostWebsite
            // Local AppHost runs are the explicit live-status dev mode: external providers stay idle
            // when no API credentials are configured, but dashboard commands can still exercise the
            // UI and webhook paths with per-run local-only signing secrets.
            .WithEnvironment("Live__EnableDevEndpoint", "true")
            .WithEnvironment("Live__DevCommandSecret", liveDevCommandSecret)
            .WithEnvironment("Live__Twitch__WebhookSecret", liveDevTwitchWebhookSecret)
            .WithEnvironment("Live__YouTube__WebhookSecret", liveDevYouTubeWebhookSecret)
            .WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (StaticHost)")
            .WithLiveStatusUrls()
            .WithLiveStatusCommands(
                liveDevCommandSecret,
                liveDevTwitchWebhookSecret,
                liveDevYouTubeWebhookSecret);
    }

    private static IResourceBuilder<ProjectResource> WithLiveStatusUrls(this IResourceBuilder<ProjectResource> staticHostWebsite) =>
        staticHostWebsite.WithUrls(ctx =>
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
        });

    private static IResourceBuilder<ProjectResource> WithLiveStatusCommands(
        this IResourceBuilder<ProjectResource> staticHostWebsite,
        string liveDevCommandSecret,
        string liveDevTwitchWebhookSecret,
        string liveDevYouTubeWebhookSecret) =>
        staticHostWebsite
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
}

internal static class LiveDevCommands
{
    public const string CommandSecretHeaderName = "X-Aspire-Live-Dev-Command-Key";

    public static string NewSecret() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

    public static HttpCommandOptions SetStatus(
        string commandSecret,
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
            PrepareRequest = context =>
            {
                AddCommandSecret(context, commandSecret);
                context.Request.Content = Json(body, "application/json");
                return Task.CompletedTask;
            },
        };

    public static HttpCommandOptions TwitchWebhook(
        string commandSecret,
        string webhookSecret,
        string description,
        string subscriptionType) =>
        new()
        {
            Method = HttpMethod.Post,
            Description = description,
            IconName = subscriptionType == "stream.online" ? "PlugConnected" : "PlugDisconnected",
            IconVariant = IconVariant.Regular,
            PrepareRequest = context =>
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
                var signature = SignTwitch(webhookSecret, messageId, timestamp, bodyBytes);

                AddCommandSecret(context, commandSecret);
                context.Request.Headers.Add("Twitch-Eventsub-Message-Id", messageId);
                context.Request.Headers.Add("Twitch-Eventsub-Message-Timestamp", timestamp);
                context.Request.Headers.Add("Twitch-Eventsub-Message-Type", "notification");
                context.Request.Headers.Add("Twitch-Eventsub-Message-Signature", $"sha256={signature}");
                context.Request.Content = Json(body, "application/json");
                return Task.CompletedTask;
            },
        };

    public static HttpCommandOptions YouTubeWebhook(
        string commandSecret,
        string webhookSecret,
        string description,
        string videoId) =>
        new()
        {
            Method = HttpMethod.Post,
            Description = description,
            IconName = "ArrowSync",
            IconVariant = IconVariant.Regular,
            PrepareRequest = context =>
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
                var signature = SignYouTube(webhookSecret, bodyBytes);
                AddCommandSecret(context, commandSecret);
                context.Request.Headers.Add("X-Hub-Signature", $"sha1={signature}");
                context.Request.Content = Json(body, "application/atom+xml");
                return Task.CompletedTask;
            },
        };

    private static void AddCommandSecret(HttpCommandRequestContext context, string commandSecret)
    {
        if (string.IsNullOrEmpty(commandSecret))
        {
            throw new InvalidOperationException("A live-status dashboard command secret is required.");
        }

        context.Request.Headers.Add(CommandSecretHeaderName, $"Key: {commandSecret}");
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
