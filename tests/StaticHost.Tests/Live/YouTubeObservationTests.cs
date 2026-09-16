using StackExchange.Redis;

namespace StaticHost.Tests.Live;

public sealed class YouTubeObservationTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Polling_RejectsResultWhenWebhookConfirmsAnotherVideo(bool delayedLive)
    {
        var redis = new TestLiveStatusRedis();
        using var polling = CreateBroadcaster(redis);
        using var webhook = CreateBroadcaster(redis);
        await polling.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "old") });
        var delayed = new TaskCompletionSource<YouTubeLiveResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var client = new ObservationClient { VideoResult = () => delayed.Task };
        var pending = CreateService(client, polling, offlineCount: 1).TickAsync(CancellationToken.None);
        Assert.Equal(1, client.VideoCalls);

        await ConfirmAsync(new ObservationClient { LiveResult = () => Task.FromResult(new YouTubeLiveResult(true, "new")) }, webhook);
        delayed.SetResult(new YouTubeLiveResult(delayedLive, delayedLive ? "old" : null));
        await pending;

        var result = await polling.GetStateAsync();
        Assert.Equal(new YouTubeStatus(true, "new"), result.Snapshot.YouTube);
        Assert.Equal(0, result.YouTubeOfflineObservations);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Webhook_RejectsResultWhenPollingDiscoversAnotherVideo(bool delayedLive)
    {
        var redis = new TestLiveStatusRedis();
        using var polling = CreateBroadcaster(redis);
        using var webhook = CreateBroadcaster(redis);
        var delayed = new TaskCompletionSource<YouTubeLiveResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var client = new ObservationClient { LiveResult = () => delayed.Task };
        var pending = ConfirmAsync(client, webhook, offlineCount: 1);
        Assert.Equal(1, client.DiscoveryCalls);

        await CreateService(
            new ObservationClient { LiveResult = () => Task.FromResult(new YouTubeLiveResult(true, "new")) },
            polling).TickAsync(CancellationToken.None);
        delayed.SetResult(new YouTubeLiveResult(delayedLive, delayedLive ? "old" : null));
        await pending;

        Assert.Equal(new YouTubeStatus(true, "new"), (await webhook.GetStateAsync()).Snapshot.YouTube);
    }

    [Fact]
    public async Task PollingAndWebhook_ShareOfflineConfirmationCountAcrossWorkers()
    {
        var redis = new TestLiveStatusRedis();
        using var polling = CreateBroadcaster(redis);
        using var webhook = CreateBroadcaster(redis);
        await polling.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "video") });
        await CreateService(new ObservationClient(), polling).TickAsync(CancellationToken.None);

        var first = await webhook.GetStateAsync();
        Assert.True(first.Snapshot.YouTube.Live);
        Assert.Equal(1, first.YouTubeOfflineObservations);
        await ConfirmAsync(new ObservationClient(), webhook);

        var second = await polling.GetStateAsync();
        Assert.False(second.Snapshot.YouTube.Live);
        Assert.Null(second.Snapshot.YouTube.VideoId);
        Assert.Equal(0, second.YouTubeOfflineObservations);
    }

    [Fact]
    public async Task OverlappingOfflineObservations_CountOnlyOnce()
    {
        var redis = new TestLiveStatusRedis();
        using var polling = CreateBroadcaster(redis);
        using var webhook = CreateBroadcaster(redis);
        await polling.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "video") });
        var delayed = new TaskCompletionSource<YouTubeLiveResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = CreateService(
            new ObservationClient { VideoResult = () => delayed.Task },
            polling).TickAsync(CancellationToken.None);

        await ConfirmAsync(new ObservationClient(), webhook);
        delayed.SetResult(new YouTubeLiveResult(false, null));
        await pending;

        var state = await polling.GetStateAsync();
        Assert.True(state.Snapshot.YouTube.Live);
        Assert.Equal(1, state.YouTubeOfflineObservations);
        Assert.Equal(2, state.YouTubeRevision);
    }

    [Fact]
    public async Task DelayedLivePoll_CannotResurrectStreamAfterConfirmedOffline()
    {
        var redis = new TestLiveStatusRedis();
        using var polling = CreateBroadcaster(redis);
        using var webhook = CreateBroadcaster(redis);
        await polling.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "video") });
        var delayed = new TaskCompletionSource<YouTubeLiveResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = CreateService(
            new ObservationClient { VideoResult = () => delayed.Task },
            polling).TickAsync(CancellationToken.None);
        await ConfirmAsync(new ObservationClient(), webhook);
        await ConfirmAsync(new ObservationClient(), webhook);
        var ended = await webhook.GetStateAsync();
        Assert.False(ended.Snapshot.YouTube.Live);

        delayed.SetResult(new YouTubeLiveResult(true, "video"));
        await pending;

        Assert.Equal(ended, await polling.GetStateAsync());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task SameStateObservation_InvalidatesAnOlderOppositeResult(bool live)
    {
        var redis = new TestLiveStatusRedis();
        var store = CreateStore(redis);
        var status = new YouTubeStatus(live, live ? "video" : null);
        await store.UpdateAsync(new LiveStatusUpdate { YouTube = status });
        var observed = await store.GetAsync();
        var accepted = await store.UpdateAsync(Observe(observed, status));

        var stale = await store.UpdateAsync(Observe(observed, new YouTubeStatus(!live, live ? null : "old")));

        Assert.Equal(observed.YouTubeRevision + 1, accepted.YouTubeRevision);
        Assert.Equal(accepted, stale);
    }

    [Fact]
    public async Task Observation_RejectsABAEvenWhenVideoAndStatusMatchAgain()
    {
        var redis = new TestLiveStatusRedis();
        var store = CreateStore(redis);
        await store.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "video") });
        var observed = await store.GetAsync();
        await store.UpdateAsync(new LiveStatusUpdate { YouTube = new(false, null) });
        var latest = await store.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "video") });

        var result = await store.UpdateAsync(Observe(observed, new(false, null)));

        Assert.Equal(latest, result);
    }

    [Fact]
    public async Task Observation_RejectsPreviousRedisEpoch()
    {
        var redis = new TestLiveStatusRedis();
        var store = CreateStore(redis);
        var observed = await store.GetAsync();
        var replacement = LiveStatusState.CreateInitial();
        redis.Set(LiveStatusRedisKeys.State, Serialize(replacement));

        var result = await store.UpdateAsync(Observe(observed, new(true, "old")));

        Assert.Equal(replacement, result);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CompareExchangeConflict_RechecksObservationAgainstWinningYouTubeRevision(bool delayedLive)
    {
        var redis = new TestLiveStatusRedis();
        var store = CreateStore(redis);
        await store.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "old") });
        var observed = await store.GetAsync();
        var winner = LiveStatusReducer.Apply(
            observed,
            new LiveStatusUpdate { YouTube = new(true, "new") },
            DateTimeOffset.UnixEpoch);
        var injected = false;
        redis.CompareExchangeOverride = (_, key, _, _) =>
        {
            if (injected)
            {
                return null;
            }

            injected = true;
            var payload = Serialize(winner);
            redis.Set(key, payload);
            return new RedisCompareExchangeResult(false, payload);
        };

        var result = await store.UpdateAsync(Observe(observed, new(delayedLive, delayedLive ? "old" : null)));

        Assert.True(injected);
        Assert.Equal(winner, result);
        Assert.Equal(winner, await store.GetAsync());
        Assert.Single(redis.PublishedValues);
    }

    [Fact]
    public async Task CompareExchangeConflict_PreservesIndependentTwitchUpdate()
    {
        var redis = new TestLiveStatusRedis();
        var store = CreateStore(redis);
        var observed = await store.GetAsync();
        var winner = LiveStatusReducer.Apply(
            observed,
            new LiveStatusUpdate { Twitch = new(true, "channel", "title") },
            DateTimeOffset.UnixEpoch);
        var injected = false;
        redis.CompareExchangeOverride = (_, key, _, _) =>
        {
            if (injected)
            {
                return null;
            }

            injected = true;
            var payload = Serialize(winner);
            redis.Set(key, payload);
            return new RedisCompareExchangeResult(false, payload);
        };

        var result = await store.UpdateAsync(Observe(observed, new(true, "video")));

        Assert.Equal(winner.Snapshot.Twitch, result.Snapshot.Twitch);
        Assert.Equal(new YouTubeStatus(true, "video"), result.Snapshot.YouTube);
        Assert.Equal("twitch", result.Snapshot.PrimarySource);
        Assert.Equal(1, result.YouTubeRevision);
        Assert.Equal(2, result.Version);
    }

    [Fact]
    public async Task StaleYouTubeInCombinedUpdate_DoesNotDiscardTwitch()
    {
        var store = CreateStore(new TestLiveStatusRedis());
        var observed = await store.GetAsync();
        await store.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "new") });
        var update = Observe(observed, new(false, null));
        update.Twitch = new(true, "channel", "title");

        var result = await store.UpdateAsync(update);

        Assert.True(result.Snapshot.Twitch.Live);
        Assert.Equal(new YouTubeStatus(true, "new"), result.Snapshot.YouTube);
        Assert.Equal(1, result.YouTubeRevision);
    }

    [Fact]
    public async Task PositiveObservation_ResetsSharedOfflineConfirmationCount()
    {
        var redis = new TestLiveStatusRedis();
        using var polling = CreateBroadcaster(redis);
        using var webhook = CreateBroadcaster(redis);
        await polling.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "video") });
        var service = CreateService(new ObservationClient(), polling);
        await service.TickAsync(CancellationToken.None);
        await ConfirmAsync(
            new ObservationClient { LiveResult = () => Task.FromResult(new YouTubeLiveResult(true, "video")) },
            webhook);
        await service.TickAsync(CancellationToken.None);

        var state = await polling.GetStateAsync();
        Assert.True(state.Snapshot.YouTube.Live);
        Assert.Equal(1, state.YouTubeOfflineObservations);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task FailedLookup_DoesNotCountAsOffline(bool pollingRequest)
    {
        using var broadcaster = CreateBroadcaster(new TestLiveStatusRedis());
        await broadcaster.UpdateAsync(new LiveStatusUpdate { YouTube = new(true, "video") });
        await ConfirmAsync(new ObservationClient(), broadcaster);
        var before = await broadcaster.GetStateAsync();
        var client = new ObservationClient
        {
            LiveResult = () => Task.FromException<YouTubeLiveResult>(new HttpRequestException("quota")),
            VideoResult = () => Task.FromException<YouTubeLiveResult>(new HttpRequestException("quota")),
        };

        await Assert.ThrowsAsync<HttpRequestException>(() => pollingRequest
            ? CreateService(client, broadcaster).TickAsync(CancellationToken.None)
            : ConfirmAsync(client, broadcaster));

        Assert.Equal(before, await broadcaster.GetStateAsync());
    }

    [Fact]
    public async Task ObservationMetadata_IsNotPartOfClientSnapshotJson()
    {
        var store = CreateStore(new TestLiveStatusRedis());
        var observed = await store.GetAsync();
        var state = await store.UpdateAsync(Observe(observed, new(true, "video")));
        var json = JsonSerializer.Serialize(state.Snapshot, LiveStatusJsonContext.Default.LiveStatus);

        Assert.DoesNotContain("revision", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("offlineObservations", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("epoch", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task LegacyStateWithoutObservationMetadata_RemainsReadable()
    {
        var redis = new TestLiveStatusRedis();
        var initial = LiveStatusState.CreateInitial();
        var snapshot = JsonSerializer.Serialize(initial.Snapshot, LiveStatusJsonContext.Default.LiveStatus);
        redis.Set(
            LiveStatusRedisKeys.State,
            $$"""{"epoch":"{{initial.Epoch}}","version":0,"snapshot":{{snapshot}}}""");
        var store = CreateStore(redis);
        var state = await store.GetAsync();

        Assert.Equal(initial, state);
        var updated = await store.UpdateAsync(Observe(state, new(true, "video")));
        Assert.Equal(1, updated.YouTubeRevision);
        Assert.True(updated.Snapshot.YouTube.Live);
    }

    private static LiveStatusUpdate Observe(LiveStatusState state, YouTubeStatus status) => new()
    {
        YouTube = status,
        YouTubeObservation = new(state.Epoch, state.YouTubeRevision, 1),
    };

    private static RedisLiveStatusStore CreateStore(TestLiveStatusRedis redis) =>
        new(redis, TimeProvider.System, NullLogger<RedisLiveStatusStore>.Instance);

    private static LiveStatusBroadcaster CreateBroadcaster(TestLiveStatusRedis redis) =>
        new(
            Options.Create(new LiveStatusOptions { CoalesceWindowMs = 0 }),
            NullLogger<LiveStatusBroadcaster>.Instance,
            TimeProvider.System,
            CreateStore(redis));

    private static YouTubeWebSubService CreateService(
        IYouTubeClient client,
        LiveStatusBroadcaster broadcaster,
        int offlineCount = 2) =>
        new(
            client,
            broadcaster,
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                YouTube = new YouTubeOptions
                {
                    ApiKey = "key",
                    ChannelId = "channel",
                    OfflineConfirmationCount = offlineCount,
                },
            }),
            NullLogger<YouTubeWebSubService>.Instance,
            TimeProvider.System,
            new YouTubeWebSubSubscriptionState(),
            new SingleInstanceLiveStatusCoordination());

    private static Task ConfirmAsync(
        IYouTubeClient client,
        LiveStatusBroadcaster broadcaster,
        int offlineCount = 2) =>
        LiveStatusEndpointRouteBuilderExtensions.ConfirmYouTubeLiveStatusAsync(
            new YouTubeOptions { ChannelId = "channel", OfflineConfirmationCount = offlineCount },
            client,
            broadcaster,
            NullLogger.Instance,
            CancellationToken.None);

    private static byte[] Serialize(LiveStatusState state) =>
        JsonSerializer.SerializeToUtf8Bytes(state, LiveStatusJsonContext.Default.LiveStatusState);

    private sealed class ObservationClient : IYouTubeClient
    {
        public Func<Task<YouTubeLiveResult>> LiveResult { get; init; } =
            () => Task.FromResult(new YouTubeLiveResult(false, null));

        public Func<Task<YouTubeLiveResult>> VideoResult { get; init; } =
            () => Task.FromResult(new YouTubeLiveResult(false, null));

        public int DiscoveryCalls { get; private set; }
        public int VideoCalls { get; private set; }

        public Task<string?> ResolveChannelIdAsync(string handle, CancellationToken cancellationToken) =>
            Task.FromResult<string?>("channel");

        public Task<YouTubeLiveResult> GetCurrentLiveAsync(string channelId, CancellationToken cancellationToken)
        {
            DiscoveryCalls++;
            return LiveResult();
        }

        public Task<YouTubeLiveResult> GetVideoLiveStatusAsync(string videoId, CancellationToken cancellationToken)
        {
            VideoCalls++;
            return VideoResult();
        }

        public Task SubscribeAsync(
            string channelId,
            string callbackUrl,
            string secret,
            string verifyToken,
            TimeSpan lease,
            CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
