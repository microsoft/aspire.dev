namespace StaticHost.Tests.Live;

public sealed class YouTubeWebSubRetryTests
{
    [Fact]
    public async Task FailedRequests_BackOffAcrossWorkersWithBoundedJitter()
    {
        var redis = new TestLiveStatusRedis();
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);

        for (var attempt = 1; attempt <= 7; attempt++)
        {
            var state = CreateState(redis, time);
            var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
                await state.TryBeginSubscriptionAsync("channel", time.GetUtcNow()));
            Assert.Equal("https://www.youtube.com/feeds/videos.xml?channel_id=channel", request.Topic);
            time.Advance(TimeSpan.FromSeconds(30));
            var failedAt = time.GetUtcNow();
            var retry = Assert.IsType<YouTubeWebSubRetryState>(await state.MarkRequestFailedAsync(request));
            var maximumMinutes = attempt switch { 1 => 2, 2 => 5, 3 => 15, 4 => 30, _ => 60 };

            Assert.Equal(attempt, retry.FailureCount);
            Assert.InRange(retry.RetryAt - failedAt,
                TimeSpan.FromMinutes(maximumMinutes * 0.9),
                TimeSpan.FromMinutes(maximumMinutes));
            var otherWorker = CreateState(redis, time);
            Assert.Null(await otherWorker.TryBeginSubscriptionAsync("channel", retry.RetryAt.AddTicks(-1)));
            Assert.Null(await otherWorker.MarkRequestFailedAsync(request));
            time.SetUtcNow(retry.RetryAt);
        }
    }

    [Fact]
    public async Task OnlyVerificationResetsFailures_AndLateFailureCannotUndoRecovery()
    {
        var redis = new TestLiveStatusRedis();
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var state = CreateState(redis, time);
        var first = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", time.GetUtcNow()));
        var failure = Assert.IsType<YouTubeWebSubRetryState>(await state.MarkRequestFailedAsync(first));
        time.SetUtcNow(failure.RetryAt);
        var second = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", time.GetUtcNow()));
        await state.MarkRequestSentAsync(second, time.GetUtcNow());
        var secondFailure = Assert.IsType<YouTubeWebSubRetryState>(await state.MarkRequestFailedAsync(second));
        Assert.Equal(2, secondFailure.FailureCount);
        time.SetUtcNow(secondFailure.RetryAt);
        var third = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", time.GetUtcNow()));

        Assert.True(await CreateState(redis, time).TryConfirmSubscriptionAsync(
            "subscribe", third.Topic, third.VerifyToken, 3600, time.GetUtcNow()));
        Assert.Null(await state.MarkRequestFailedAsync(third));
        Assert.Null(await state.TryBeginSubscriptionAsync("channel", time.GetUtcNow()));
        time.SetUtcNow(await state.GetRenewAtAsync());
        var renewal = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", time.GetUtcNow()));
        var renewalFailure = Assert.IsType<YouTubeWebSubRetryState>(await state.MarkRequestFailedAsync(renewal));
        Assert.Equal(1, renewalFailure.FailureCount);
    }

    [Fact]
    public async Task ChannelChangeIsNotBlockedByPreviousChannelsBackoff()
    {
        var redis = new TestLiveStatusRedis();
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var state = CreateState(redis, time);
        var old = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("old-channel", time.GetUtcNow()));
        await state.MarkRequestFailedAsync(old);

        var replacement = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("new-channel", time.GetUtcNow()));
        Assert.Null(await state.MarkRequestFailedAsync(old));
        var retry = Assert.IsType<YouTubeWebSubRetryState>(await state.MarkRequestFailedAsync(replacement));
        Assert.Equal(1, retry.FailureCount);
        Assert.Equal(replacement.Topic, retry.Topic);
    }

    [Fact]
    public async Task ExistingRedisPayloadWithoutRetryState_ResubscribesToCorrectedTopic()
    {
        var redis = new TestLiveStatusRedis();
        redis.Set(LiveStatusRedisKeys.YouTubeSubscription, """
            {"version":1,"data":{"pending":null,
            "activeTopic":"https://www.youtube.com/xml/feeds/videos.xml?channel_id=channel",
            "renewAt":"2030-01-01T00:00:00+00:00","recentConfirmation":null}}
            """);
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var state = CreateState(redis, time);

        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", time.GetUtcNow()));

        Assert.Equal("https://www.youtube.com/feeds/videos.xml?channel_id=channel", request.Topic);
        Assert.True(await state.TryConfirmSubscriptionAsync(
            "subscribe", request.Topic, request.VerifyToken, 3600, time.GetUtcNow()));
    }

    private static RedisYouTubeWebSubSubscriptionState CreateState(TestLiveStatusRedis redis, TimeProvider time) =>
        new(redis, time, NullLogger<RedisYouTubeWebSubSubscriptionState>.Instance);
}
