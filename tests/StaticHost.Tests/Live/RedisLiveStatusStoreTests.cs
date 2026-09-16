using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Hosting;
using StackExchange.Redis;

namespace StaticHost.Tests.Live;

public sealed class RedisLiveStatusStoreTests
{
    [Fact]
    public void AddLiveStatus_RegistersOnlyRedisBackedProductionState()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.Configuration["ConnectionStrings:cache"] = "localhost:6379";

        builder.AddLiveStatus();

        Assert.Contains(
            builder.Services,
            descriptor =>
                descriptor.ServiceType == typeof(ILiveStatusRedis) &&
                descriptor.ImplementationType == typeof(LiveStatusRedis));
        Assert.Contains(
            builder.Services,
            descriptor =>
                descriptor.ServiceType == typeof(ILiveStatusStore) &&
                descriptor.ImplementationType == typeof(RedisLiveStatusStore));
        Assert.DoesNotContain(
            builder.Services,
            descriptor => descriptor.ServiceType == typeof(IDistributedCache));
    }

    [Fact]
    public void RedisKeys_AreStableAndUnversioned()
    {
        Assert.Equal("aspiredev:live:{state}", LiveStatusRedisKeys.State);
        Assert.Equal("aspiredev:live:updates", LiveStatusRedisKeys.UpdatesChannel);
        Assert.Equal(
            "aspiredev:live:youtube-confirmation",
            LiveStatusRedisKeys.YouTubeConfirmation);
        Assert.Equal(
            "aspiredev:live:{youtube-subscription}",
            LiveStatusRedisKeys.YouTubeSubscription);
        Assert.Equal(
            "aspiredev:live:twitch-leader",
            LiveStatusRedisKeys.TwitchLeader);
        Assert.Equal(
            "aspiredev:live:youtube-leader",
            LiveStatusRedisKeys.YouTubeLeader);
    }

    [Fact]
    public async Task GetAsync_ConditionallyCreatesOneCanonicalEpoch()
    {
        var redis = new TestLiveStatusRedis();
        var first = CreateStore(redis);
        var second = CreateStore(redis);

        var firstState = await first.GetAsync();
        var secondState = await second.GetAsync();

        Assert.Equal(firstState, secondState);
        Assert.Equal(1, redis.CompareExchangeCalls);
    }

    [Fact]
    public async Task UpdateAsync_RetriesAgainstWinningStateAndMergesProviders()
    {
        var redis = new TestLiveStatusRedis();
        var store = CreateStore(redis);
        var winningEpoch = Guid.NewGuid();
        var winningState = new LiveStatusState(
            winningEpoch,
            1,
            LiveStatus.Idle with
            {
                IsLive = true,
                PrimarySource = "twitch",
                Twitch = new TwitchStatus(true, "aspiredotdev", "Live"),
                LiveSessionId = "live-winner",
                UpdatedAt = DateTimeOffset.UnixEpoch,
            });
        var winningPayload = Serialize(winningState);

        redis.CompareExchangeOverride = (attempt, key, _, _) =>
        {
            if (attempt != 1)
            {
                return null;
            }

            redis.Set(key, winningPayload);
            return new RedisCompareExchangeResult(false, winningPayload);
        };

        var result = await store.UpdateAsync(
            new LiveStatusUpdate
            {
                YouTube = new YouTubeStatus(true, "video-1"),
            });

        Assert.Equal(winningEpoch, result.Epoch);
        Assert.Equal(2, result.Version);
        Assert.True(result.Snapshot.Twitch.Live);
        Assert.True(result.Snapshot.YouTube.Live);
        Assert.Equal(2, redis.CompareExchangeCalls);
        Assert.Equal(1, redis.GetCalls);
        var published = Assert.Single(redis.PublishedValues);
        Assert.Equal(redis.Get(LiveStatusRedisKeys.State), published);
    }

    [Fact]
    public async Task UpdateAsync_DoesNotWriteOrPublishExistingNoOp()
    {
        var redis = new TestLiveStatusRedis();
        var state = LiveStatusState.CreateInitial();
        redis.Set(LiveStatusRedisKeys.State, Serialize(state));
        var store = CreateStore(redis);

        var result = await store.UpdateAsync(
            new LiveStatusUpdate
            {
                Twitch = new TwitchStatus(false, null, null),
            });

        Assert.Equal(state, result);
        Assert.Equal(0, redis.CompareExchangeCalls);
        Assert.Empty(redis.PublishedValues);
    }

    [Fact]
    public async Task UpdateAsync_PersistsMissingNoOpWithoutPublishing()
    {
        var redis = new TestLiveStatusRedis();
        var store = CreateStore(redis);

        var result = await store.UpdateAsync(
            new LiveStatusUpdate
            {
                Twitch = new TwitchStatus(false, null, null),
            });

        Assert.Equal(0, result.Version);
        Assert.False(redis.Get(LiveStatusRedisKeys.State).IsNull);
        Assert.Equal(1, redis.CompareExchangeCalls);
        Assert.Empty(redis.PublishedValues);
    }

    [Fact]
    public async Task UpdateAsync_StopsAfterBoundedContention()
    {
        var redis = new TestLiveStatusRedis();
        var state = LiveStatusState.CreateInitial();
        var payload = Serialize(state);
        redis.Set(LiveStatusRedisKeys.State, payload);
        redis.CompareExchangeOverride = (_, _, _, _) =>
            new RedisCompareExchangeResult(false, payload);
        var store = CreateStore(redis);

        await Assert.ThrowsAsync<LiveStatusConcurrencyException>(
            () => store.UpdateAsync(
                new LiveStatusUpdate
                {
                    Twitch = new TwitchStatus(true, "aspiredotdev", null),
                }).AsTask());

        Assert.Equal(
            RedisOptimisticConcurrency.MaxAttempts,
            redis.CompareExchangeCalls);
        Assert.Empty(redis.PublishedValues);
    }

    [Fact]
    public async Task UpdateAsync_StopsRetryingWhenCancelled()
    {
        var redis = new TestLiveStatusRedis();
        var state = LiveStatusState.CreateInitial();
        var payload = Serialize(state);
        redis.Set(LiveStatusRedisKeys.State, payload);
        using var cancellation = new CancellationTokenSource();
        redis.CompareExchangeOverride = (_, _, _, _) =>
        {
            cancellation.Cancel();
            return new RedisCompareExchangeResult(false, payload);
        };
        var store = CreateStore(redis);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => store.UpdateAsync(
                new LiveStatusUpdate
                {
                    Twitch = new TwitchStatus(true, "aspiredotdev", null),
                },
                cancellation.Token).AsTask());

        Assert.Equal(1, redis.CompareExchangeCalls);
        Assert.Empty(redis.PublishedValues);
    }

    private static RedisLiveStatusStore CreateStore(TestLiveStatusRedis redis) =>
        new(
            redis,
            TimeProvider.System,
            NullLogger<RedisLiveStatusStore>.Instance);

    private static byte[] Serialize(LiveStatusState state) =>
        JsonSerializer.SerializeToUtf8Bytes(
            state,
            LiveStatusJsonContext.Default.LiveStatusState);
}

public sealed class RedisYouTubeWebSubSubscriptionStateTests
{
    [Fact]
    public async Task TryBeginSubscriptionAsync_ReturnsTheRequestPersistedByWinningAttempt()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        string? losingToken = null;

        redis.CompareExchangeOverride = (attempt, key, _, value) =>
        {
            if (attempt != 1)
            {
                return null;
            }

            losingToken = Deserialize(value).Data.Pending?.VerifyToken;
            var competing = new YouTubeWebSubSubscriptionStateRecord(
                4,
                new YouTubeWebSubSubscriptionData(
                    new YouTubeWebSubSubscriptionRequest(
                        "https://example.com/other",
                        "competing-token",
                        now),
                    ActiveTopic: null,
                    RenewAt: DateTimeOffset.MinValue));
            var competingPayload = Serialize(competing);
            redis.Set(key, competingPayload);
            return new RedisCompareExchangeResult(false, competingPayload);
        };

        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel-123", now));
        var persisted = Deserialize(redis.Get(LiveStatusRedisKeys.YouTubeSubscription));

        Assert.NotEqual(losingToken, request.VerifyToken);
        Assert.Equal(request, persisted.Data.Pending);
        Assert.Equal(5, persisted.Version);
        Assert.Equal(2, redis.CompareExchangeCalls);
        Assert.Equal(1, redis.GetCalls);
    }

    [Fact]
    public async Task InvalidConfirmationDoesNotWrite()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);

        Assert.False(await state.TryConfirmSubscriptionAsync(
            "unsubscribe",
            "topic",
            "token",
            60,
            DateTimeOffset.UnixEpoch));

        Assert.Equal(0, redis.CompareExchangeCalls);
    }

    [Fact]
    public async Task MutationsAdvanceTheRecordVersion()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel-123", now));
        await state.MarkRequestSentAsync(request, now.AddSeconds(1));
        await state.MarkRequestFailedAsync(request);

        var persisted = Deserialize(redis.Get(LiveStatusRedisKeys.YouTubeSubscription));
        Assert.Equal(3, persisted.Version);
        Assert.Null(persisted.Data.Pending);
    }

    private static RedisYouTubeWebSubSubscriptionState CreateState(
        TestLiveStatusRedis redis) =>
        new(
            redis,
            TimeProvider.System,
            NullLogger<RedisYouTubeWebSubSubscriptionState>.Instance);

    private static YouTubeWebSubSubscriptionStateRecord Deserialize(RedisValue value)
    {
        byte[]? bytes = value;
        return JsonSerializer.Deserialize(
            bytes!,
            LiveStatusJsonContext.Default.YouTubeWebSubSubscriptionStateRecord)!;
    }

    private static byte[] Serialize(YouTubeWebSubSubscriptionStateRecord state) =>
        JsonSerializer.SerializeToUtf8Bytes(
            state,
            LiveStatusJsonContext.Default.YouTubeWebSubSubscriptionStateRecord);
}

internal sealed class TestLiveStatusRedis : ILiveStatusRedis
{
    private readonly Dictionary<string, RedisValue> _values = new(StringComparer.Ordinal);

    public Func<
        int,
        RedisKey,
        RedisValue,
        RedisValue,
        RedisCompareExchangeResult?>? CompareExchangeOverride { get; set; }

    public int GetCalls { get; private set; }

    public int CompareExchangeCalls { get; private set; }

    public List<RedisValue> PublishedValues { get; } = [];

    public ValueTask<RedisValue> GetAsync(
        RedisKey key,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        GetCalls++;
        return ValueTask.FromResult(Get(key));
    }

    public ValueTask<RedisCompareExchangeResult> CompareExchangeAsync(
        RedisKey key,
        RedisValue expected,
        RedisValue value,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        CompareExchangeCalls++;

        var overridden = CompareExchangeOverride?.Invoke(
            CompareExchangeCalls,
            key,
            expected,
            value);
        if (overridden is { } result)
        {
            return ValueTask.FromResult(result);
        }

        var current = Get(key);
        var matches = expected.IsNull
            ? current.IsNull
            : !current.IsNull && current == expected;
        if (!matches)
        {
            return ValueTask.FromResult(
                new RedisCompareExchangeResult(false, current));
        }

        Set(key, value);
        return ValueTask.FromResult(
            new RedisCompareExchangeResult(true, value));
    }

    public ValueTask PublishAsync(RedisChannel channel, RedisValue value)
    {
        PublishedValues.Add(value);
        return ValueTask.CompletedTask;
    }

    public RedisValue Get(RedisKey key) =>
        _values.TryGetValue(key.ToString(), out var value)
            ? value
            : RedisValue.Null;

    public void Set(RedisKey key, RedisValue value) =>
        _values[key.ToString()] = value;
}
