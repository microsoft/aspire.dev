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
    /// Subscribe (or renew) the WebSub topic for the channel via PubSubHubbub.
    /// </summary>
    Task SubscribeAsync(string channelId, string callbackUrl, string secret, TimeSpan lease, CancellationToken cancellationToken);
}
