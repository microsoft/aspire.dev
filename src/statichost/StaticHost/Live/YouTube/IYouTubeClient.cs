namespace StaticHost.Live.YouTube;

/// <summary>Result of looking up the current live state for a channel.</summary>
public sealed record YouTubeLiveResult(bool Live, string? VideoId);

/// <summary>Abstraction over the YouTube Data API v3 used by the live-status feature.</summary>
public interface IYouTubeClient
{
    /// <summary>
    /// Resolve a channel handle (e.g. <c>@aspiredotdev</c>) to a channel id.
    /// Returns null when not found.
    /// </summary>
    Task<string?> ResolveChannelIdAsync(string handle, CancellationToken cancellationToken);

    /// <summary>
    /// Returns the current live broadcast for the channel, or
    /// <c>(false, null)</c> when none is live.
    /// </summary>
    Task<YouTubeLiveResult> GetCurrentLiveAsync(string channelId, CancellationToken cancellationToken);

    /// <summary>
    /// Returns whether a known video is still live. This uses the low-cost
    /// <c>videos.list</c> API instead of the discovery-oriented
    /// <c>search.list</c> API.
    /// </summary>
    Task<YouTubeLiveResult> GetVideoLiveStatusAsync(string videoId, CancellationToken cancellationToken);

    /// <summary>
    /// Subscribe (or renew) the WebSub topic for the channel via PubSubHubbub.
    /// </summary>
    Task SubscribeAsync(
        string channelId,
        string callbackUrl,
        string secret,
        string verifyToken,
        TimeSpan lease,
        CancellationToken cancellationToken);
}
