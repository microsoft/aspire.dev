using StackExchange.Redis;

namespace StaticHost.Tests.Live;

[Collection(RedisIntegrationCollection.Name)]
[Trait("Category", "RedisIntegration")]
public sealed class RedisYouTubeIntegrationTests(RedisIntegrationFixture fixture) : RedisIntegrationTest(fixture)
{
    [Theory]
    [InlineData("new-video")]
    [InlineData("old-video")]
    public async Task DelayedOfflinePoll_CannotOverwriteAnotherWorkersNewerLiveObservation(string latestVideo)
    {
        var firstStore = Store(Redis.First);
        var secondStore = Store(Redis.Second);
        await secondStore.UpdateAsync(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "old-video") });
        using var broadcaster = Broadcaster(firstStore);
        var lookupStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var lookupResult = new TaskCompletionSource<YouTubeLiveResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var client = new RedisIntegrationYouTubeClient
        {
            VideoLookup = async (video, token) =>
            {
                Assert.Equal("old-video", video);
                lookupStarted.SetResult();
                return await lookupResult.Task.WaitAsync(TestTimeout, token);
            },
        };
        using var service = Service(client, broadcaster, Redis.First, offlineConfirmationCount: 1);

        // No synchronizer populates this process: the poll must read canonical Redis state.
        Assert.False(broadcaster.Current.YouTube.Live);
        var tick = service.TickAsync(CancellationToken.None);
        try
        {
            await lookupStarted.Task.WaitAsync(TestTimeout);
            var latest = await secondStore.UpdateAsync(new LiveStatusUpdate
            {
                YouTube = new YouTubeStatus(true, latestVideo),
            });
            lookupResult.SetResult(new YouTubeLiveResult(false, null));
            await tick.WaitAsync(TestTimeout);

            var canonical = await firstStore.GetAsync();
            Assert.Equal(latest, canonical);
            Assert.True(canonical.Snapshot.YouTube.Live);
            Assert.Equal(latestVideo, canonical.Snapshot.YouTube.VideoId);
            Assert.Equal(0, canonical.YouTubeOfflineObservations);
            Assert.Equal(0, client.DiscoveryCalls);
        }
        finally
        {
            lookupResult.TrySetResult(new YouTubeLiveResult(false, null));
            await tick.WaitAsync(TestTimeout);
        }
    }

    [Fact]
    public async Task SimultaneousOfflineEvidence_CountsOnce_AndNextWorkerCompletesConfirmation()
    {
        var initial = await Store(Redis.First).UpdateAsync(new LiveStatusUpdate
        {
            YouTube = new YouTubeStatus(true, "shared-video"),
        });
        var observation = new YouTubeObservation(initial.Epoch, initial.YouTubeRevision, 2);
        var barrier = new RedisIntegrationReadBarrier(LiveStatusRedisKeys.State);
        var first = new RedisLiveStatusStore(
            barrier.Wrap(new LiveStatusRedis(Redis.First)),
            TimeProvider.System,
            NullLogger<RedisLiveStatusStore>.Instance);
        var second = new RedisLiveStatusStore(
            barrier.Wrap(new LiveStatusRedis(Redis.Second)),
            TimeProvider.System,
            NullLogger<RedisLiveStatusStore>.Instance);

        await Task.WhenAll(
            first.UpdateAsync(new LiveStatusUpdate
            {
                YouTube = new YouTubeStatus(false, null),
                YouTubeObservation = observation,
            }).AsTask(),
            second.UpdateAsync(new LiveStatusUpdate
            {
                YouTube = new YouTubeStatus(false, null),
                YouTubeObservation = observation,
            }).AsTask()).WaitAsync(TestTimeout);

        var once = await Store(Redis.First).GetAsync();
        Assert.True(once.Snapshot.YouTube.Live);
        Assert.Equal(1, once.YouTubeOfflineObservations);
        Assert.Equal(initial.YouTubeRevision + 1, once.YouTubeRevision);
        Assert.True(barrier.Conflicts > 0);

        using var replacementBroadcaster = Broadcaster(Store(Redis.Second));
        var client = new RedisIntegrationYouTubeClient
        {
            VideoLookup = (video, _) =>
            {
                Assert.Equal("shared-video", video);
                return Task.FromResult(new YouTubeLiveResult(false, null));
            },
        };
        using var replacementWorker = Service(client, replacementBroadcaster, Redis.Second);
        await replacementWorker.TickAsync(CancellationToken.None);

        var offline = await Store(Redis.First).GetAsync();
        Assert.False(offline.Snapshot.YouTube.Live);
        Assert.Null(offline.Snapshot.YouTube.VideoId);
        Assert.Equal(0, offline.YouTubeOfflineObservations);
        Assert.Equal(once.YouTubeRevision + 1, offline.YouTubeRevision);
        Assert.Equal(0, client.DiscoveryCalls);
    }

    [Fact]
    public async Task WebSubReservation_CompetingWorkersUseRealCompareExchange()
    {
        var now = DateTimeOffset.UtcNow;
        var barrier = new RedisIntegrationReadBarrier(LiveStatusRedisKeys.YouTubeSubscription);
        var first = SubscriptionState(barrier.Wrap(new LiveStatusRedis(Redis.First)));
        var second = SubscriptionState(barrier.Wrap(new LiveStatusRedis(Redis.Second)));

        var results = await Task.WhenAll(
            first.TryBeginSubscriptionAsync("channel-123", now).AsTask(),
            second.TryBeginSubscriptionAsync("channel-123", now).AsTask()).WaitAsync(TestTimeout);

        var winner = Assert.Single(results.OfType<YouTubeWebSubSubscriptionRequest>());
        Assert.Single(results, result => result is null);
        Assert.True(barrier.Conflicts > 0);
        Assert.Null(await SubscriptionState(Redis.Second).TryBeginSubscriptionAsync("channel-123", now));

        await first.MarkRequestSentAsync(winner, now);
        Assert.True(await second.TryConfirmSubscriptionAsync(
            "subscribe", winner.Topic, winner.VerifyToken, 3_600, now));
        Assert.Equal(now.AddSeconds(2_880), await first.GetRenewAtAsync());
    }

    [Theory]
    [InlineData(60, 60)]
    [InlineData(3_600, 600)]
    public async Task WebSubConfirmation_RetryOnAnotherWorker_IsBoundedAndNeverExtendsLease(
        int leaseSeconds, int retryWindowSeconds)
    {
        var now = DateTimeOffset.UtcNow;
        var first = SubscriptionState(Redis.First);
        var second = SubscriptionState(Redis.Second);
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await first.TryBeginSubscriptionAsync("channel-123", now));
        await first.MarkRequestSentAsync(request, now);
        var confirmedAt = now.AddSeconds(1);

        Assert.True(await second.TryConfirmSubscriptionAsync(
            "subscribe", request.Topic, request.VerifyToken, leaseSeconds, confirmedAt));
        var renewAt = await first.GetRenewAtAsync();
        var persisted = await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription);

        Assert.True(await first.TryConfirmSubscriptionAsync(
            "subscribe", request.Topic, request.VerifyToken, 7_200, confirmedAt.AddSeconds(1)));
        Assert.Equal(renewAt, await second.GetRenewAtAsync());
        Assert.Equal(persisted, await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription));
        Assert.False(await first.TryConfirmSubscriptionAsync(
            "unsubscribe", request.Topic, request.VerifyToken, leaseSeconds, confirmedAt.AddSeconds(1)));
        Assert.False(await first.TryConfirmSubscriptionAsync(
            "subscribe", request.Topic + "-wrong", request.VerifyToken, leaseSeconds, confirmedAt.AddSeconds(1)));
        Assert.False(await first.TryConfirmSubscriptionAsync(
            "subscribe", request.Topic, "wrong-token", leaseSeconds, confirmedAt.AddSeconds(1)));
        Assert.False(await first.TryConfirmSubscriptionAsync(
            "subscribe", request.Topic, request.VerifyToken, 0, confirmedAt.AddSeconds(1)));
        Assert.False(await second.TryConfirmSubscriptionAsync(
            "subscribe", request.Topic, request.VerifyToken, leaseSeconds, confirmedAt.AddSeconds(retryWindowSeconds)));
        Assert.Equal(persisted, await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription));
    }

    [Fact]
    public async Task WebSubRenewal_InvalidatesOldConfirmationEvenInsideItsRetryWindow()
    {
        var now = DateTimeOffset.UtcNow;
        var first = SubscriptionState(Redis.First);
        var second = SubscriptionState(Redis.Second);
        var old = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await first.TryBeginSubscriptionAsync("channel-123", now));
        Assert.True(await second.TryConfirmSubscriptionAsync(
            "subscribe", old.Topic, old.VerifyToken, 60, now));
        var renewal = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await second.TryBeginSubscriptionAsync("channel-123", now.AddSeconds(49)));
        var pending = await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription);

        Assert.False(await first.TryConfirmSubscriptionAsync(
            "subscribe", old.Topic, old.VerifyToken, 60, now.AddSeconds(50)));
        Assert.Equal(pending, await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription));
        Assert.True(await first.TryConfirmSubscriptionAsync(
            "subscribe", renewal.Topic, renewal.VerifyToken, 3_600, now.AddSeconds(50)));
    }

    [Fact]
    public async Task WebSubReplacement_RejectsAbandonedOwnersLateWritesAndVerification()
    {
        var now = DateTimeOffset.UtcNow;
        var first = SubscriptionState(Redis.First);
        var second = SubscriptionState(Redis.Second);
        var abandoned = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await first.TryBeginSubscriptionAsync("channel-123", now));
        Assert.Null(await second.TryBeginSubscriptionAsync("channel-123", now.AddSeconds(29)));
        var replacementAt = now.AddSeconds(31);
        var replacement = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await second.TryBeginSubscriptionAsync("channel-123", replacementAt));
        Assert.NotEqual(abandoned.VerifyToken, replacement.VerifyToken);
        await second.MarkRequestSentAsync(replacement, replacementAt);
        var pending = await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription);

        await first.MarkRequestSentAsync(abandoned, replacementAt.AddSeconds(1));
        await first.MarkRequestFailedAsync(abandoned);
        Assert.Equal(pending, await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription));
        Assert.False(await first.TryConfirmSubscriptionAsync(
            "subscribe", abandoned.Topic, abandoned.VerifyToken, 3_600, replacementAt.AddSeconds(2)));
        Assert.True(await first.TryConfirmSubscriptionAsync(
            "subscribe", replacement.Topic, replacement.VerifyToken, 3_600, replacementAt.AddSeconds(2)));
        var confirmed = await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription);

        await second.MarkRequestFailedAsync(replacement);
        await second.MarkRequestSentAsync(replacement, replacementAt.AddMinutes(1));
        Assert.Equal(confirmed, await Redis.Database.StringGetAsync(LiveStatusRedisKeys.YouTubeSubscription));
    }

    [Fact]
    public async Task WebSubFailedSend_AllowsAnotherWorkerToRetryWithoutClearingItsReservation()
    {
        var now = DateTimeOffset.UtcNow;
        var first = SubscriptionState(Redis.First);
        var second = SubscriptionState(Redis.Second);
        var failed = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await first.TryBeginSubscriptionAsync("channel-123", now));
        await first.MarkRequestFailedAsync(failed);
        var retry = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await second.TryBeginSubscriptionAsync("channel-123", now.AddSeconds(1)));
        await second.MarkRequestSentAsync(retry, now.AddSeconds(2));

        await first.MarkRequestFailedAsync(failed);
        await first.MarkRequestSentAsync(failed, now.AddMinutes(1));
        Assert.Null(await first.TryBeginSubscriptionAsync("channel-123", now.AddMinutes(9)));
        Assert.True(await first.TryConfirmSubscriptionAsync(
            "subscribe", retry.Topic, retry.VerifyToken, 3_600, now.AddMinutes(9)));
    }

    private static RedisYouTubeWebSubSubscriptionState SubscriptionState(IConnectionMultiplexer connection) =>
        SubscriptionState(new LiveStatusRedis(connection));

    private static RedisYouTubeWebSubSubscriptionState SubscriptionState(ILiveStatusRedis redis) =>
        new(redis, TimeProvider.System, NullLogger<RedisYouTubeWebSubSubscriptionState>.Instance);

    private static YouTubeWebSubService Service(
        IYouTubeClient client,
        LiveStatusBroadcaster broadcaster,
        IConnectionMultiplexer connection,
        int offlineConfirmationCount = 2) =>
        new(
            client,
            broadcaster,
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                YouTube = new YouTubeOptions
                {
                    ApiKey = "integration-test-api-key",
                    ChannelId = "channel-123",
                    OfflineConfirmationCount = offlineConfirmationCount,
                },
            }),
            NullLogger<YouTubeWebSubService>.Instance,
            TimeProvider.System,
            SubscriptionState(connection),
            Coordination(connection));
}

internal sealed class RedisIntegrationYouTubeClient : IYouTubeClient
{
    public required Func<string, CancellationToken, Task<YouTubeLiveResult>> VideoLookup { get; init; }
    public int DiscoveryCalls { get; private set; }

    public Task<string?> ResolveChannelIdAsync(string handle, CancellationToken cancellationToken) =>
        Task.FromResult<string?>("channel-123");

    public Task<YouTubeLiveResult> GetCurrentLiveAsync(string channelId, CancellationToken cancellationToken)
    {
        DiscoveryCalls++;
        return Task.FromResult(new YouTubeLiveResult(false, null));
    }

    public Task<YouTubeLiveResult> GetVideoLiveStatusAsync(string videoId, CancellationToken cancellationToken) =>
        VideoLookup(videoId, cancellationToken);

    public Task SubscribeAsync(
        string channelId,
        string callbackUrl,
        string secret,
        string verifyToken,
        TimeSpan lease,
        CancellationToken cancellationToken) => Task.CompletedTask;
}
