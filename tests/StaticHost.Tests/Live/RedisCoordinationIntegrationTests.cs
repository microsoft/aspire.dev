using StackExchange.Redis;

namespace StaticHost.Tests.Live;

[Collection(RedisIntegrationCollection.Name)]
[Trait("Category", "RedisIntegration")]
public sealed class RedisCoordinationIntegrationTests(RedisIntegrationFixture fixture) : RedisIntegrationTest(fixture)
{
    [Fact]
    public async Task Leadership_ExcludesAnotherWorker_Renews_Releases_AndAllowsTakeover()
    {
        var key = Redis.NewKey("leader");
        var firstTime = new RedisIntegrationTimeProvider();
        var secondTime = new RedisIntegrationTimeProvider();
        using var firstCancellation = new CancellationTokenSource();
        using var secondCancellation = new CancellationTokenSource();
        var firstEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var secondEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = Coordination(Redis.First, firstTime).RunAsLeaderAsync(
            key,
            async token =>
            {
                firstEntered.SetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, token);
            },
            firstCancellation.Token);
        Task second = Task.CompletedTask;

        try
        {
            await firstEntered.Task.WaitAsync(TestTimeout);
            var owner = await Redis.Database.StringGetAsync(key);
            Assert.False(owner.IsNullOrEmpty);
            await EventuallyAsync(
                () => Task.FromResult(firstTime.TimersCreated > 0),
                "the leader should start its renewal timer");

            second = Coordination(Redis.Second, secondTime).RunAsLeaderAsync(
                key,
                async token =>
                {
                    secondEntered.SetResult();
                    await Task.Delay(Timeout.InfiniteTimeSpan, token);
                },
                secondCancellation.Token);
            await EventuallyAsync(
                () => Task.FromResult(secondTime.TimersCreated > 0),
                "the contender should fail acquisition and start its retry timer");
            Assert.False(secondEntered.Task.IsCompleted);
            Assert.Equal(owner, await Redis.Database.StringGetAsync(key));

            Assert.True(await Redis.Database.KeyExpireAsync(key, TimeSpan.FromSeconds(10)));
            firstTime.Advance(TimeSpan.FromSeconds(15));
            await EventuallyAsync(
                async () => await Redis.Database.KeyTimeToLiveAsync(key) > TimeSpan.FromSeconds(30),
                "renewal should extend the real Redis lease");

            await StopLeaderAsync(first, firstCancellation);
            Assert.False(await Redis.Database.KeyExistsAsync(key));
            await EventuallyAsync(
                () => Task.FromResult(secondEntered.Task.IsCompleted),
                "the waiting worker should take over after release",
                () => secondTime.Advance(TimeSpan.FromSeconds(5)));
            Assert.NotEqual(owner, await Redis.Database.StringGetAsync(key));
        }
        finally
        {
            await Task.WhenAll(
                StopLeaderAsync(first, firstCancellation),
                StopLeaderAsync(second, secondCancellation));
        }

        Assert.False(await Redis.Database.KeyExistsAsync(key));
    }

    [Fact]
    public async Task ExpiredLeader_LosesLeadership_AndCannotReleaseReplacementLease()
    {
        var key = Redis.NewKey("expired-leader");
        var firstTime = new RedisIntegrationTimeProvider();
        var secondTime = new RedisIntegrationTimeProvider();
        using var firstCancellation = new CancellationTokenSource();
        using var secondCancellation = new CancellationTokenSource();
        var firstEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var firstExited = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var secondEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = Coordination(Redis.First, firstTime).RunAsLeaderAsync(
            key,
            async token =>
            {
                firstEntered.SetResult();
                try
                {
                    await Task.Delay(Timeout.InfiniteTimeSpan, token);
                }
                finally
                {
                    firstExited.SetResult();
                }
            },
            firstCancellation.Token);
        Task second = Task.CompletedTask;

        try
        {
            await firstEntered.Task.WaitAsync(TestTimeout);
            var firstOwner = await Redis.Database.StringGetAsync(key);
            await EventuallyAsync(
                () => Task.FromResult(firstTime.TimersCreated > 0),
                "the first leader should start renewal");

            Assert.True(await Redis.Database.KeyExpireAsync(key, TimeSpan.FromMilliseconds(50)));
            await EventuallyAsync(
                async () => !await Redis.Database.KeyExistsAsync(key),
                "the original lease should expire on the real server");
            second = Coordination(Redis.Second, secondTime).RunAsLeaderAsync(
                key,
                async token =>
                {
                    secondEntered.SetResult();
                    await Task.Delay(Timeout.InfiniteTimeSpan, token);
                },
                secondCancellation.Token);
            await secondEntered.Task.WaitAsync(TestTimeout);
            var replacementOwner = await Redis.Database.StringGetAsync(key);
            Assert.NotEqual(firstOwner, replacementOwner);

            firstTime.Advance(TimeSpan.FromSeconds(15));
            await firstExited.Task.WaitAsync(TestTimeout);
            await StopLeaderAsync(first, firstCancellation);

            Assert.Equal(replacementOwner, await Redis.Database.StringGetAsync(key));
            Assert.False(second.IsCompleted);
        }
        finally
        {
            await Task.WhenAll(
                StopLeaderAsync(first, firstCancellation),
                StopLeaderAsync(second, secondCancellation));
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TwitchMessage_DeduplicatesAcrossWorkers_AndRetriesFailedHandling(bool redisFailure)
    {
        const string notification =
            """{"subscription":{"type":"stream.online"},"event":{"broadcaster_user_login":"aspiredotdev"}}""";
        var messageId = Redis.NewTwitchMessageId();
        var first = Coordination(Redis.First);
        var second = Coordination(Redis.Second);
        using var broadcaster = Broadcaster(Store(Redis.First));
        var acquired = await first.AcquireTwitchMessageAsync(messageId);
        Assert.Equal(TwitchMessageAcquisitionStatus.Acquired, acquired.Status);
        await using (var lease = Assert.IsAssignableFrom<ITwitchMessageLease>(acquired.Lease))
        {
            var duplicate = await second.AcquireTwitchMessageAsync(messageId);
            Assert.Equal(TwitchMessageAcquisitionStatus.Processing, duplicate.Status);
            Assert.Null(duplicate.Lease);
            if (redisFailure)
            {
                await Redis.Database.ListLeftPushAsync(LiveStatusRedisKeys.State, "wrong-type");
                await Assert.ThrowsAnyAsync<RedisException>(() => TwitchWebhookHandler.HandleAsync(
                    "notification", notification, broadcaster, new TwitchOptions(), NullLogger.Instance));
                Assert.True(await Redis.Database.KeyDeleteAsync(LiveStatusRedisKeys.State));
            }
            else
            {
                await Assert.ThrowsAnyAsync<JsonException>(() => TwitchWebhookHandler.HandleAsync(
                    "notification", "{", broadcaster, new TwitchOptions(), NullLogger.Instance));
            }
        }

        var retry = await second.AcquireTwitchMessageAsync(messageId);
        Assert.Equal(TwitchMessageAcquisitionStatus.Acquired, retry.Status);
        await using (var lease = Assert.IsAssignableFrom<ITwitchMessageLease>(retry.Lease))
        {
            await TwitchWebhookHandler.HandleAsync(
                "notification",
                notification,
                broadcaster,
                new TwitchOptions(),
                NullLogger.Instance);
            await lease.CompleteAsync();
        }

        Assert.True((await Store(Redis.Second).GetAsync()).Snapshot.Twitch.Live);
        var replay = await first.AcquireTwitchMessageAsync(messageId);
        Assert.Equal(TwitchMessageAcquisitionStatus.Completed, replay.Status);
        Assert.Null(replay.Lease);
    }

    [Fact]
    public async Task TwitchMessage_ExpiredOwnerCannotCompleteOrReleaseReplacement()
    {
        var messageId = Redis.NewTwitchMessageId();
        var key = LiveStatusRedisKeys.TwitchMessagePrefix +
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(messageId)));
        var acquired = await Coordination(Redis.First).AcquireTwitchMessageAsync(messageId);
        await using var expired = Assert.IsAssignableFrom<ITwitchMessageLease>(acquired.Lease);
        Assert.True(await Redis.Database.KeyExpireAsync(key, TimeSpan.FromMilliseconds(50)));
        await EventuallyAsync(
            async () => !await Redis.Database.KeyExistsAsync(key),
            "the abandoned Twitch processing lease should expire");

        var replacement = await Coordination(Redis.Second).AcquireTwitchMessageAsync(messageId);
        Assert.Equal(TwitchMessageAcquisitionStatus.Acquired, replacement.Status);
        await using var replacementLease = Assert.IsAssignableFrom<ITwitchMessageLease>(replacement.Lease);
        var owner = await Redis.Database.StringGetAsync(key);
        await Assert.ThrowsAsync<InvalidOperationException>(() => expired.CompleteAsync().AsTask());
        await expired.DisposeAsync();
        Assert.Equal(owner, await Redis.Database.StringGetAsync(key));

        await replacementLease.CompleteAsync();
        Assert.Equal(
            TwitchMessageAcquisitionStatus.Completed,
            (await Coordination(Redis.First).AcquireTwitchMessageAsync(messageId)).Status);
        Assert.True(await Redis.Database.KeyTimeToLiveAsync(key) > TimeSpan.FromMinutes(10));
    }

    [Fact]
    public async Task YouTubeConfirmation_CoalescesAcrossWorkers_AndReopensAfterExpiry()
    {
        var first = Coordination(Redis.First);
        var second = Coordination(Redis.Second);
        Assert.True(await first.TryQueueYouTubeConfirmationAsync());
        Assert.False(await second.TryQueueYouTubeConfirmationAsync());
        Assert.True(await Redis.Database.KeyExpireAsync(
            LiveStatusRedisKeys.YouTubeConfirmation, TimeSpan.FromMilliseconds(50)));
        await EventuallyAsync(
            async () => !await Redis.Database.KeyExistsAsync(LiveStatusRedisKeys.YouTubeConfirmation),
            "the shared confirmation debounce should expire");
        Assert.True(await second.TryQueueYouTubeConfirmationAsync());
        Assert.False(await first.TryQueueYouTubeConfirmationAsync());
    }
}
