using StackExchange.Redis;

namespace StaticHost.Tests.Live;

[Collection(RedisIntegrationCollection.Name)]
[Trait("Category", "RedisIntegration")]
public sealed class RedisSynchronizerIntegrationTests(RedisIntegrationFixture fixture) : RedisIntegrationTest(fixture)
{
    [Fact]
    public async Task Synchronizer_DeliversAnotherWorkersPublicationToLocalSubscribers()
    {
        var time = new RedisIntegrationTimeProvider();
        var readerStore = Store(Redis.Second);
        using var broadcaster = Broadcaster(readerStore, time);
        using var synchronizer = new LiveStatusSynchronizer(
            Redis.Second, readerStore, broadcaster, time, NullLogger<LiveStatusSynchronizer>.Instance);
        var (reader, subscription) = broadcaster.Subscribe();
        using var unsubscribe = subscription;
        Assert.False((await reader.ReadAsync()).Snapshot.IsLive);

        await synchronizer.StartAsync(CancellationToken.None);
        try
        {
            await EventuallyAsync(
                () => Task.FromResult(time.TimersCreated > 0),
                "the subscriber should finish its initial Redis refresh");

            var written = await Store(Redis.First).UpdateAsync(new LiveStatusUpdate
            {
                Twitch = new TwitchStatus(true, "aspiredotdev", "Across workers"),
            });
            var delivered = await reader.ReadAsync().AsTask().WaitAsync(TestTimeout);

            Assert.Equal(written.Snapshot, delivered.Snapshot);
            Assert.Equal(written.Snapshot, broadcaster.Current);
            Assert.Equal(written, await readerStore.GetAsync());
        }
        finally
        {
            using var stop = new CancellationTokenSource(TestTimeout);
            await synchronizer.StopAsync(stop.Token);
        }
    }

    [Fact]
    public async Task Synchronizer_RecoversMissedNotifications_AndRecreatedCanonicalState()
    {
        var time = new RedisIntegrationTimeProvider();
        var writer = Store(Redis.First);
        var readerStore = Store(Redis.Second);
        using var broadcaster = Broadcaster(readerStore, time);
        using var synchronizer = new LiveStatusSynchronizer(
            Redis.Second, readerStore, broadcaster, time, NullLogger<LiveStatusSynchronizer>.Instance);
        var (reader, subscription) = broadcaster.Subscribe();
        using var unsubscribe = subscription;
        await reader.ReadAsync();

        await synchronizer.StartAsync(CancellationToken.None);
        try
        {
            await EventuallyAsync(
                () => Task.FromResult(time.TimersCreated > 0),
                "the synchronizer should subscribe and start its resync timer");

            // Disconnect only pub/sub delivery; canonical reads and writes still use real Redis.
            await Redis.Second.GetSubscriber().UnsubscribeAsync(
                RedisChannel.Literal(LiveStatusRedisKeys.UpdatesChannel));
            var missed = await writer.UpdateAsync(new LiveStatusUpdate
            {
                YouTube = new YouTubeStatus(true, "missed-video"),
            });
            Assert.False(broadcaster.Current.IsLive);
            Assert.False(reader.TryRead(out _));

            time.Advance(TimeSpan.FromSeconds(30));
            var recovered = await reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
            Assert.Equal(missed.Snapshot, recovered.Snapshot);

            Assert.True(await Redis.Database.KeyDeleteAsync(LiveStatusRedisKeys.State));
            var recreated = await writer.UpdateAsync(new LiveStatusUpdate
            {
                Twitch = new TwitchStatus(true, "aspiredotdev", "New epoch"),
            });
            Assert.NotEqual(missed.Epoch, recreated.Epoch);
            Assert.Equal(1, recreated.Version);
            Assert.Equal(missed.Snapshot, broadcaster.Current);

            time.Advance(TimeSpan.FromSeconds(30));
            var recoveredEpoch = await reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
            Assert.Equal(recreated.Snapshot, recoveredEpoch.Snapshot);
            Assert.False(recoveredEpoch.Snapshot.YouTube.Live);
        }
        finally
        {
            using var stop = new CancellationTokenSource(TestTimeout);
            await synchronizer.StopAsync(stop.Token);
        }
    }

    [Fact]
    public async Task ConcurrentProviderUpdates_UseRealCompareExchange_AndPreserveBothProviders()
    {
        var initial = await Store(Redis.First).GetAsync();
        var barrier = new RedisIntegrationReadBarrier(LiveStatusRedisKeys.State);
        var firstRedis = barrier.Wrap(new LiveStatusRedis(Redis.First));
        var secondRedis = barrier.Wrap(new LiveStatusRedis(Redis.Second));
        var first = new RedisLiveStatusStore(
            firstRedis, TimeProvider.System, NullLogger<RedisLiveStatusStore>.Instance);
        var second = new RedisLiveStatusStore(
            secondRedis, TimeProvider.System, NullLogger<RedisLiveStatusStore>.Instance);

        await Task.WhenAll(
            first.UpdateAsync(new LiveStatusUpdate
            {
                Twitch = new TwitchStatus(true, "aspiredotdev", null),
            }).AsTask(),
            second.UpdateAsync(new LiveStatusUpdate
            {
                YouTube = new YouTubeStatus(true, "concurrent-video"),
            }).AsTask()).WaitAsync(TestTimeout);

        var canonical = await Store(Redis.First).GetAsync();
        Assert.True(canonical.Snapshot.Twitch.Live);
        Assert.Equal("concurrent-video", canonical.Snapshot.YouTube.VideoId);
        Assert.Equal(initial.Epoch, canonical.Epoch);
        Assert.Equal(initial.Version + 2, canonical.Version);
        Assert.True(barrier.Conflicts > 0);
    }
}

// Synchronizes the first two real Redis reads so production Lua CAS must resolve a conflict.
internal sealed class RedisIntegrationReadBarrier(RedisKey key)
{
    private readonly RedisKey _key = key;
    private readonly TaskCompletionSource _readersReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private int _readers;
    private int _conflicts;

    public int Conflicts => Volatile.Read(ref _conflicts);
    public ILiveStatusRedis Wrap(ILiveStatusRedis redis) => new GatedRedis(this, redis);

    private sealed class GatedRedis(RedisIntegrationReadBarrier owner, ILiveStatusRedis redis) : ILiveStatusRedis
    {
        public async ValueTask<RedisValue> GetAsync(RedisKey requested, CancellationToken cancellationToken)
        {
            var value = await redis.GetAsync(requested, cancellationToken);
            if (requested == owner._key && Interlocked.Increment(ref owner._readers) <= 2)
            {
                if (Volatile.Read(ref owner._readers) == 2)
                {
                    owner._readersReady.TrySetResult();
                }

                await owner._readersReady.Task.WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
            }

            return value;
        }

        public async ValueTask<RedisCompareExchangeResult> CompareExchangeAsync(
            RedisKey requested, RedisValue expected, RedisValue value, CancellationToken cancellationToken)
        {
            var result = await redis.CompareExchangeAsync(requested, expected, value, cancellationToken);
            if (!result.Succeeded)
            {
                Interlocked.Increment(ref owner._conflicts);
            }

            return result;
        }

        public ValueTask PublishAsync(RedisChannel channel, RedisValue value) => redis.PublishAsync(channel, value);
    }
}
