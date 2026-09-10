using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using StackExchange.Redis;

namespace StaticHost.Live;

/// <summary>Reads and atomically updates the canonical live-status state.</summary>
public interface ILiveStatusStore
{
    ValueTask<LiveStatusState> GetAsync(CancellationToken cancellationToken = default);

    ValueTask<LiveStatusState> UpdateAsync(
        LiveStatusUpdate update,
        CancellationToken cancellationToken = default);
}

internal sealed class InMemoryLiveStatusStore : ILiveStatusStore
{
    private readonly Lock _lock = new();
    private readonly TimeProvider _timeProvider;
    private LiveStatusState _state = LiveStatusState.CreateInitial();

    public InMemoryLiveStatusStore(TimeProvider? timeProvider = null) =>
        _timeProvider = timeProvider ?? TimeProvider.System;

    public ValueTask<LiveStatusState> GetAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_lock)
        {
            return ValueTask.FromResult(_state);
        }
    }

    public ValueTask<LiveStatusState> UpdateAsync(
        LiveStatusUpdate update,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_lock)
        {
            var next = LiveStatusReducer.Apply(_state.Snapshot, update, _timeProvider.GetUtcNow());
            if (next == _state.Snapshot)
            {
                return ValueTask.FromResult(_state);
            }

            _state = new LiveStatusState(_state.Epoch, _state.Version + 1, next);
            return ValueTask.FromResult(_state);
        }
    }
}

internal sealed class RedisLiveStatusStore(
    IDistributedCache cache,
    IConnectionMultiplexer connectionMultiplexer,
    RedisDistributedLock distributedLock,
    TimeProvider timeProvider,
    ILogger<RedisLiveStatusStore> logger) : ILiveStatusStore
{
    public async ValueTask<LiveStatusState> GetAsync(CancellationToken cancellationToken = default)
    {
        var payload = await cache.GetAsync(
            LiveStatusRedisKeys.State,
            cancellationToken).ConfigureAwait(false);

        return payload is null
            ? LiveStatusState.CreateInitial()
            : JsonSerializer.Deserialize(payload, LiveStatusJsonContext.Default.LiveStatusState)
                ?? throw new InvalidOperationException("The distributed live-status state was empty.");
    }

    public async ValueTask<LiveStatusState> UpdateAsync(
        LiveStatusUpdate update,
        CancellationToken cancellationToken = default)
    {
        var result = await distributedLock.ExecuteAsync(
            LiveStatusRedisKeys.StateLock,
            async (lockLease, lockCancellationToken) =>
            {
                var current = await GetAsync(lockCancellationToken).ConfigureAwait(false);
                var snapshot = LiveStatusReducer.Apply(
                    current.Snapshot,
                    update,
                    timeProvider.GetUtcNow());

                if (snapshot == current.Snapshot)
                {
                    return new PersistedUpdate(current, Payload: null);
                }

                var next = new LiveStatusState(
                    current.Epoch,
                    current.Version + 1,
                    snapshot);
                var payload = JsonSerializer.SerializeToUtf8Bytes(
                    next,
                    LiveStatusJsonContext.Default.LiveStatusState);

                await lockLease.SetCacheValueAsync(
                    LiveStatusRedisKeys.State,
                    payload).ConfigureAwait(false);

                return new PersistedUpdate(next, payload);
            },
            cancellationToken).ConfigureAwait(false);

        if (result.Payload is not null)
        {
            try
            {
                await connectionMultiplexer.GetSubscriber().PublishAsync(
                    RedisChannel.Literal(LiveStatusRedisKeys.UpdatesChannel),
                    result.Payload).ConfigureAwait(false);
            }
            catch (RedisException exception)
            {
                logger.LogWarning(
                    exception,
                    "Persisted live status version {Version}, but could not publish its update.",
                    result.State.Version);
            }
        }

        return result.State;
    }

    private readonly record struct PersistedUpdate(LiveStatusState State, byte[]? Payload);
}

internal static class LiveStatusReducer
{
    public static LiveStatus Apply(
        LiveStatus current,
        LiveStatusUpdate update,
        DateTimeOffset updatedAt)
    {
        var twitch = update.Twitch ?? current.Twitch;
        var youTube = update.YouTube ?? current.YouTube;
        if (twitch == current.Twitch && youTube == current.YouTube)
        {
            return current;
        }

        var isLive = twitch.Live || youTube.Live;

        return current with
        {
            IsLive = isLive,
            PrimarySource = ResolvePrimary(current.PrimarySource, twitch, youTube),
            Twitch = twitch,
            YouTube = youTube,
            LiveSessionId = ResolveLiveSessionId(current, isLive, updatedAt),
            UpdatedAt = updatedAt,
        };
    }

    private static string? ResolvePrimary(
        string? previous,
        TwitchStatus twitch,
        YouTubeStatus youTube)
    {
        if (previous == "twitch" && twitch.Live)
        {
            return "twitch";
        }

        if (previous == "youtube" && youTube.Live)
        {
            return "youtube";
        }

        if (twitch.Live)
        {
            return "twitch";
        }

        return youTube.Live ? "youtube" : null;
    }

    private static string? ResolveLiveSessionId(
        LiveStatus current,
        bool isLive,
        DateTimeOffset updatedAt)
    {
        if (!isLive)
        {
            return null;
        }

        if (current.IsLive && !string.IsNullOrEmpty(current.LiveSessionId))
        {
            return current.LiveSessionId;
        }

        return $"live-{updatedAt.ToUnixTimeMilliseconds():x}";
    }
}

internal static class LiveStatusRedisKeys
{
    private const string Prefix = "aspiredev:live:";

    public const string State = Prefix + "{state}:v1";
    public const string StateLock = Prefix + "{state}:lock:v1";
    public const string UpdatesChannel = Prefix + "updates:v1";
    public const string TwitchMessagePrefix = Prefix + "twitch-message:";
    public const string YouTubeConfirmation = Prefix + "youtube-confirmation:v1";
    public const string YouTubeSubscription = Prefix + "{youtube-subscription}:v1";
    public const string YouTubeSubscriptionLock = Prefix + "{youtube-subscription}:lock:v1";
    public const string TwitchLeader = Prefix + "twitch-leader:v1";
    public const string YouTubeLeader = Prefix + "youtube-leader:v1";
}
