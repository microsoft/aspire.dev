using StackExchange.Redis;

namespace StaticHost.Tests.Live;

public sealed class YouTubeWebSubConfirmationTests
{
    [Fact]
    public async Task ConfirmationRetry_RecoversPersistedConfirmationAfterLostRedisResponse()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        redis.CompareExchangeOverride = (_, key, _, value) =>
        {
            redis.Set(key, value);
            throw new RedisConnectionException(ConnectionFailureType.SocketFailure, "response lost");
        };

        await Assert.ThrowsAsync<RedisConnectionException>(
            () => ConfirmAsync(state, request, 3600, now).AsTask());
        redis.CompareExchangeOverride = null;
        var persisted = Read(redis);

        Assert.True(await ConfirmAsync(CreateState(redis), request, 7200, now.AddMinutes(1)));
        Assert.Equal(persisted, Read(redis));
        Assert.Equal(now.AddMinutes(10), persisted.Data.RecentConfirmation!.RetryUntil);
    }

    [Fact]
    public async Task ConfirmationRetry_OnAnotherWorkerPreservesFirstLeaseAndDeadline()
    {
        var redis = new TestLiveStatusRedis();
        var first = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await first.TryBeginSubscriptionAsync("channel", now));
        await first.MarkRequestSentAsync(request, now);
        var confirmedAt = now.AddMinutes(1);
        Assert.True(await ConfirmAsync(first, request, 3600, confirmedAt));
        var persisted = Read(redis);
        Assert.Equal(confirmedAt, persisted.Data.RecentConfirmation!.ConfirmedAt);
        Assert.Equal(confirmedAt.AddMinutes(10), persisted.Data.RecentConfirmation.RetryUntil);
        Assert.Equal(request.Topic, persisted.Data.RecentConfirmation.Topic);
        Assert.Equal(request.VerifyToken, persisted.Data.RecentConfirmation.VerifyToken);
        Assert.Null(persisted.Data.Pending);
        var writes = redis.CompareExchangeCalls;

        var retryingWorker = CreateState(redis);
        Assert.True(await ConfirmAsync(retryingWorker, request, 7200, confirmedAt.AddMinutes(5)));
        Assert.True(await ConfirmAsync(retryingWorker, request, 86400, confirmedAt.AddMinutes(9)));

        Assert.Equal(persisted, Read(redis));
        Assert.Equal(writes, redis.CompareExchangeCalls);
        Assert.Equal(confirmedAt.AddSeconds(3600 * 0.8), await retryingWorker.GetRenewAtAsync());
        Assert.False(await ConfirmAsync(retryingWorker, request, 3600, confirmedAt.AddMinutes(10)));
        Assert.Equal(persisted, Read(redis));
    }

    [Theory]
    [InlineData(30)]
    [InlineData(600)]
    [InlineData(3600)]
    public async Task RetryWindow_IsCappedByGrantedLeaseAndExcludesDeadline(int leaseSeconds)
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        Assert.True(await ConfirmAsync(state, request, leaseSeconds, now));
        var deadline = now.AddSeconds(Math.Min(leaseSeconds, 600));
        var original = Read(redis);

        Assert.True(await ConfirmAsync(state, request, 86400, deadline.AddTicks(-1)));
        Assert.False(await ConfirmAsync(state, request, 86400, deadline));
        Assert.False(await ConfirmAsync(state, request, 86400, deadline.AddSeconds(1)));
        Assert.Equal(original, Read(redis));
        Assert.Equal(deadline, original.Data.RecentConfirmation!.RetryUntil);
    }

    [Theory]
    [InlineData("unsubscribe", false, false, 60)]
    [InlineData("subscribe", true, false, 60)]
    [InlineData("subscribe", false, true, 60)]
    [InlineData("subscribe", false, false, 0)]
    [InlineData("subscribe", false, false, -1)]
    public async Task Retry_RejectsMismatchedOrInvalidConfirmation(
        string mode,
        bool wrongTopic,
        bool wrongToken,
        int leaseSeconds)
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        Assert.True(await ConfirmAsync(state, request, 3600, now));
        var original = Read(redis);
        var mismatchedToken = (request.VerifyToken[0] == '0' ? "1" : "0") + request.VerifyToken[1..];

        Assert.False(await state.TryConfirmSubscriptionAsync(
            mode,
            wrongTopic ? request.Topic + "-other" : request.Topic,
            wrongToken ? mismatchedToken : request.VerifyToken,
            leaseSeconds,
            now.AddSeconds(1)));

        Assert.Equal(original, Read(redis));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task BeginningNewSubscription_SupersedesPreviousConfirmationImmediately(bool differentChannel)
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var first = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        Assert.True(await ConfirmAsync(state, first, 60, now));
        var replacementAt = differentChannel ? now.AddSeconds(1) : now.AddSeconds(48);
        var replacement = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync(differentChannel ? "other-channel" : "channel", replacementAt));

        Assert.Null(Read(redis).Data.RecentConfirmation);
        Assert.False(await ConfirmAsync(CreateState(redis), first, 3600, replacementAt));
        Assert.Equal(replacement, Read(redis).Data.Pending);
        Assert.True(await ConfirmAsync(state, replacement, 3600, replacementAt));
        Assert.False(await ConfirmAsync(state, first, 3600, replacementAt.AddSeconds(1)));
        Assert.True(await ConfirmAsync(CreateState(redis), replacement, 3600, replacementAt.AddSeconds(1)));
    }

    [Fact]
    public async Task FailedNewSubscription_DoesNotRestoreSupersededToken()
    {
        var state = CreateState(new TestLiveStatusRedis());
        var now = DateTimeOffset.UnixEpoch;
        var first = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        Assert.True(await ConfirmAsync(state, first, 60, now));
        var replacement = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now.AddSeconds(48)));
        await state.MarkRequestFailedAsync(replacement);

        Assert.False(await ConfirmAsync(state, first, 3600, now.AddSeconds(49)));
    }

    [Fact]
    public async Task ConfirmationBeforeMarkRequestSent_CannotBeMovedOrClearedByLateCompletion()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        Assert.True(await ConfirmAsync(state, request, 3600, now.AddSeconds(1)));
        var confirmed = Read(redis);

        await CreateState(redis).MarkRequestSentAsync(request, now.AddMinutes(5));
        await state.MarkRequestFailedAsync(request);

        Assert.Equal(confirmed, Read(redis));
        Assert.True(await ConfirmAsync(state, request, 3600, now.AddMinutes(6)));
        Assert.Equal(confirmed, Read(redis));
    }

    [Fact]
    public async Task MarkRequestSentRetry_DoesNotExtendPendingVerificationWindow()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        await state.MarkRequestSentAsync(request, now.AddSeconds(1));
        await CreateState(redis).MarkRequestSentAsync(request, now.AddMinutes(5));

        Assert.Equal(now.AddSeconds(1), Read(redis).Data.Pending!.SentAt);
        Assert.False(await ConfirmAsync(state, request, 3600, now.AddSeconds(601)));
    }

    [Fact]
    public async Task PendingVerification_RejectsExpiredAndSupersededRequests()
    {
        var state = CreateState(new TestLiveStatusRedis());
        var now = DateTimeOffset.UnixEpoch;
        var first = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        await state.MarkRequestSentAsync(first, now);
        Assert.False(await ConfirmAsync(state, first, 3600, now.AddMinutes(10)));
        var replacement = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now.AddMinutes(10)));

        Assert.False(await ConfirmAsync(state, first, 3600, now.AddMinutes(10)));
        Assert.True(await ConfirmAsync(state, replacement, 3600, now.AddMinutes(10)));
    }

    [Fact]
    public async Task CompareExchangeConflict_AnotherConfirmationWinsWithoutMovingFirstDeadline()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        var pending = Read(redis);
        Assert.True(YouTubeWebSubSubscriptionTransitions.TryConfirm(
            pending.Data, "subscribe", request.Topic, request.VerifyToken, 60, now, out var winner));
        var winningRecord = new YouTubeWebSubSubscriptionStateRecord(pending.Version + 1, winner);
        InjectWinningState(redis, winningRecord);

        Assert.True(await ConfirmAsync(state, request, 3600, now.AddSeconds(1)));

        Assert.Equal(winningRecord, Read(redis));
        Assert.Equal(now.AddSeconds(48), await state.GetRenewAtAsync());
    }

    [Fact]
    public async Task CompareExchangeConflict_RenewalSupersedesInFlightOldConfirmation()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var old = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        var pending = Read(redis);
        var replacement = new YouTubeWebSubSubscriptionRequest(old.Topic, "new-token", now.AddMinutes(10));
        var winningRecord = pending with
        {
            Version = pending.Version + 1,
            Data = pending.Data with { Pending = replacement },
        };
        InjectWinningState(redis, winningRecord);

        Assert.False(await ConfirmAsync(state, old, 3600, now.AddSeconds(1)));

        Assert.Equal(winningRecord, Read(redis));
    }

    [Fact]
    public async Task CompareExchangeConflict_MarkRequestSentCannotOverwriteConfirmation()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        var pending = Read(redis);
        Assert.True(YouTubeWebSubSubscriptionTransitions.TryConfirm(
            pending.Data, "subscribe", request.Topic, request.VerifyToken, 3600, now, out var winner));
        var winningRecord = new YouTubeWebSubSubscriptionStateRecord(pending.Version + 1, winner);
        InjectWinningState(redis, winningRecord);

        await state.MarkRequestSentAsync(request, now.AddSeconds(1));

        Assert.Equal(winningRecord, Read(redis));
        Assert.True(await ConfirmAsync(CreateState(redis), request, 3600, now.AddSeconds(2)));
    }

    [Fact]
    public async Task CompareExchangeConflict_ConfirmationUsesPendingRequestAfterMarkRequestSent()
    {
        var redis = new TestLiveStatusRedis();
        var state = CreateState(redis);
        var now = DateTimeOffset.UnixEpoch;
        var request = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await state.TryBeginSubscriptionAsync("channel", now));
        var pending = Read(redis);
        var sent = pending with
        {
            Version = pending.Version + 1,
            Data = pending.Data with { Pending = request with { SentAt = now.AddSeconds(1) } },
        };
        InjectWinningState(redis, sent);

        Assert.True(await ConfirmAsync(state, request, 3600, now.AddSeconds(2)));

        var confirmed = Read(redis);
        Assert.Null(confirmed.Data.Pending);
        Assert.Equal(sent.Version + 1, confirmed.Version);
        Assert.Equal(now.AddSeconds(2), confirmed.Data.RecentConfirmation!.ConfirmedAt);
        Assert.Equal(now.AddMinutes(10).AddSeconds(2), confirmed.Data.RecentConfirmation.RetryUntil);
    }

    private static void InjectWinningState(
        TestLiveStatusRedis redis,
        YouTubeWebSubSubscriptionStateRecord winner)
    {
        var injected = false;
        redis.CompareExchangeOverride = (_, key, _, _) =>
        {
            if (injected)
            {
                return null;
            }

            injected = true;
            var payload = JsonSerializer.SerializeToUtf8Bytes(
                winner,
                LiveStatusJsonContext.Default.YouTubeWebSubSubscriptionStateRecord);
            redis.Set(key, payload);
            return new RedisCompareExchangeResult(false, payload);
        };
    }

    private static ValueTask<bool> ConfirmAsync(
        IYouTubeWebSubSubscriptionState state,
        YouTubeWebSubSubscriptionRequest request,
        int leaseSeconds,
        DateTimeOffset now) =>
        state.TryConfirmSubscriptionAsync("subscribe", request.Topic, request.VerifyToken, leaseSeconds, now);

    private static RedisYouTubeWebSubSubscriptionState CreateState(TestLiveStatusRedis redis) =>
        new(redis, TimeProvider.System, NullLogger<RedisYouTubeWebSubSubscriptionState>.Instance);

    private static YouTubeWebSubSubscriptionStateRecord Read(TestLiveStatusRedis redis)
    {
        byte[]? payload = redis.Get(LiveStatusRedisKeys.YouTubeSubscription);
        return JsonSerializer.Deserialize(
            payload!,
            LiveStatusJsonContext.Default.YouTubeWebSubSubscriptionStateRecord)!;
    }
}
