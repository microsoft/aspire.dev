using System.Text.Json.Serialization;

namespace StaticHost.Live;

/// <summary>
/// Aggregate live-status snapshot broadcast to all SSE subscribers.
/// </summary>
/// <param name="IsLive">True when at least one upstream source is live.</param>
/// <param name="PrimarySource">
/// The source the UI should focus on (<c>"twitch"</c>, <c>"youtube"</c>, or
/// <c>null</c> when no source is live). Sticky on the going-live race so the
/// videos-page tab does not yank around when both webhooks land within the
/// debounce window.
/// </param>
/// <param name="Twitch">Twitch sub-status.</param>
/// <param name="YouTube">YouTube sub-status.</param>
/// <param name="LiveSessionId">
/// Stable identifier for the current live session. Set when the first source
/// goes live and preserved while any source remains live, so clients can
/// suppress one notification across near-simultaneous provider webhooks.
/// </param>
/// <param name="UpdatedAt">Server timestamp of the last change.</param>
public sealed record LiveStatus(
    bool IsLive,
    string? PrimarySource,
    TwitchStatus Twitch,
    [property: JsonPropertyName("youtube")]
    YouTubeStatus YouTube,
    string? LiveSessionId,
    DateTimeOffset UpdatedAt)
{
    /// <summary>The default (idle) snapshot.</summary>
    public static LiveStatus Idle { get; } = new(
        IsLive: false,
        PrimarySource: null,
        Twitch: new TwitchStatus(false, null, null),
        YouTube: new YouTubeStatus(false, null),
        LiveSessionId: null,
        UpdatedAt: DateTimeOffset.UnixEpoch);
}

/// <summary>Twitch sub-status.</summary>
public sealed record TwitchStatus(bool Live, string? Channel, string? Title);

/// <summary>YouTube sub-status.</summary>
public sealed record YouTubeStatus(bool Live, string? VideoId);

/// <summary>
/// Source-generated JSON serialization for the live-status types.
/// Keeps the snapshot allocation-free and AOT-friendly.
/// </summary>
[JsonSerializable(typeof(LiveStatus))]
[JsonSerializable(typeof(TwitchStatus))]
[JsonSerializable(typeof(YouTubeStatus))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    WriteIndented = false)]
internal sealed partial class LiveStatusJsonContext : JsonSerializerContext;
