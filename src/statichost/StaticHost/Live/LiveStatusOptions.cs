using System.ComponentModel.DataAnnotations;

namespace StaticHost.Live;

/// <summary>
/// Strongly-typed options for the live-status feature.
/// Bound from the <c>Live</c> configuration section in <c>appsettings.json</c>
/// (and overridden by user-secrets in development and environment variables /
/// Azure Key Vault references in production).
/// </summary>
/// <remarks>
/// Missing secrets are <b>not</b> fatal. The corresponding background worker
/// detects empty values, logs a warning at startup, and stays idle. The SSE
/// endpoint still works and reports <c>{ isLive: false }</c>, the header icon
/// stays in its non-live state, and the site ships fine in any state.
/// </remarks>
public sealed class LiveStatusOptions
{
    /// <summary>The configuration section name (<c>"Live"</c>).</summary>
    public const string SectionName = "Live";

    /// <summary>
    /// Public, externally-reachable base URL of the site. Used to build the
    /// callback URLs registered with Twitch EventSub and YouTube WebSub.
    /// </summary>
    public string PublicBaseUrl { get; set; } = "https://aspire.dev";

    /// <summary>Twitch-specific configuration.</summary>
    public TwitchOptions Twitch { get; set; } = new();

    /// <summary>YouTube-specific configuration.</summary>
    public YouTubeOptions YouTube { get; set; } = new();

    /// <summary>
    /// Coalesce window for combining near-simultaneous source updates into a
    /// single broadcast event. Defaults to 750ms.
    /// </summary>
    [Range(0, 5000)]
    public int CoalesceWindowMs { get; set; } = 750;

    /// <summary>
    /// When <c>true</c>, expose the dev-only <c>POST /api/live/_dev/set</c>
    /// endpoint that lets local devs (and Playwright) flip live state without
    /// provisioning real webhooks. Only honored when the host environment is
    /// Development. The AppHost enables this automatically for local dashboard
    /// command testing; it defaults off for standalone runs.
    /// </summary>
    public bool EnableDevEndpoint { get; set; }
}

/// <summary>Twitch credentials and channel configuration.</summary>
public sealed class TwitchOptions
{
    /// <summary>Twitch application client id (Helix + EventSub).</summary>
    public string ClientId { get; set; } = "";

    /// <summary>Twitch application client secret.</summary>
    public string ClientSecret { get; set; } = "";

    /// <summary>HMAC-SHA256 secret used to verify EventSub callbacks.</summary>
    public string WebhookSecret { get; set; } = "";

    /// <summary>Login (handle) of the channel to monitor. Defaults to <c>aspiredotdev</c>.</summary>
    public string ChannelLogin { get; set; } = "aspiredotdev";

    /// <summary>
    /// Resolved Twitch user id. Optional — when empty, the worker resolves it
    /// at startup via the Helix <c>/users</c> endpoint.
    /// </summary>
    public string ChannelId { get; set; } = "";

    /// <summary>How often to reconcile EventSub subscriptions and re-seed state. Defaults to 30 minutes.</summary>
    [Range(60, 24 * 60 * 60)]
    public int ReconcileIntervalSeconds { get; set; } = 30 * 60;

    /// <summary>True when both <see cref="ClientId"/> and <see cref="ClientSecret"/> are present.</summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) &&
        !string.IsNullOrWhiteSpace(ClientSecret);
}

/// <summary>YouTube credentials and channel configuration.</summary>
public sealed class YouTubeOptions
{
    /// <summary>YouTube Data API v3 key.</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>HMAC-SHA1 secret used to verify WebSub (PubSubHubbub) callbacks.</summary>
    public string WebhookSecret { get; set; } = "";

    /// <summary>Channel handle (e.g. <c>@aspiredotdev</c>).</summary>
    public string ChannelHandle { get; set; } = "@aspiredotdev";

    /// <summary>
    /// Resolved YouTube channel id. Optional — when empty, the worker resolves
    /// it once at startup via the Data API.
    /// </summary>
    public string ChannelId { get; set; } = "";

    /// <summary>How often to poll for live state as a fallback. Defaults to 120 seconds.</summary>
    [Range(30, 60 * 60)]
    public int PollingIntervalSeconds { get; set; } = 120;

    /// <summary>
    /// Number of consecutive offline polls required before flipping the
    /// YouTube live flag from true to false. Avoids one-off poll glitches
    /// killing the live indicator during a stable stream. Defaults to 2.
    /// </summary>
    [Range(1, 10)]
    public int OfflineConfirmationCount { get; set; } = 2;

    /// <summary>True when an <see cref="ApiKey"/> is present.</summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}
