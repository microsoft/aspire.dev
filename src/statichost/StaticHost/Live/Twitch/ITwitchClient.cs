namespace StaticHost.Live.Twitch;

/// <summary>Information about a Twitch user.</summary>
public sealed record TwitchUser(string Id, string Login, string DisplayName);

/// <summary>Information about a current Twitch stream (or its absence).</summary>
public sealed record TwitchStreamInfo(bool Live, string? Title);

/// <summary>Existing EventSub subscription record.</summary>
public sealed record TwitchEventSubSubscription(
    string Id,
    string Type,
    string Status,
    string CallbackUrl,
    string? BroadcasterUserId = null);

/// <summary>Abstraction over the Twitch Helix API used by the live-status feature.</summary>
public interface ITwitchClient
{
    /// <summary>Look up a user by login (handle).</summary>
    Task<TwitchUser?> GetUserByLoginAsync(string login, CancellationToken cancellationToken);

    /// <summary>Get the current stream state for a user id.</summary>
    Task<TwitchStreamInfo> GetStreamAsync(string userId, CancellationToken cancellationToken);

    /// <summary>List EventSub subscriptions for our app (any status).</summary>
    Task<IReadOnlyList<TwitchEventSubSubscription>> ListEventSubAsync(CancellationToken cancellationToken);

    /// <summary>Create an EventSub subscription.</summary>
    Task CreateEventSubAsync(string type, string condition, string callbackUrl, string secret, CancellationToken cancellationToken);

    /// <summary>Delete an EventSub subscription by id.</summary>
    Task DeleteEventSubAsync(string id, CancellationToken cancellationToken);
}
