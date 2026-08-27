namespace StaticHost.Tests.Live;

public sealed class YouTubeWebSubServiceTests
{
    [Fact]
    public async Task TickAsync_ResolvesChannelSubscribesAndBroadcastsLiveStatus()
    {
        var client = new TestYouTubeClient
        {
            ResolvedChannelId = "channel-123",
        };
        client.LiveResults.Enqueue(new YouTubeLiveResult(true, "video-123"));
        var broadcaster = LiveTestHelpers.CreateBroadcaster();
        var service = new YouTubeWebSubService(
            client,
            broadcaster,
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                PublicBaseUrl = "https://example.com/",
                YouTube = new YouTubeOptions
                {
                    ApiKey = "api-key",
                    WebhookSecret = "webhook-secret",
                    ChannelHandle = "@aspiredotdev",
                },
            }),
            NullLogger<YouTubeWebSubService>.Instance,
            new FakeTimeProvider(DateTimeOffset.UnixEpoch));

        await service.TickAsync(CancellationToken.None);

        Assert.True(broadcaster.Current.YouTube.Live);
        Assert.Equal("video-123", broadcaster.Current.YouTube.VideoId);
        var subscription = Assert.Single(client.Subscriptions);
        Assert.Equal("channel-123", subscription.ChannelId);
        Assert.Equal("https://example.com/api/live/youtube/webhook", subscription.CallbackUrl);
        Assert.Equal("webhook-secret", subscription.Secret);
        Assert.NotEmpty(subscription.VerifyToken);
        Assert.Equal(TimeSpan.FromDays(5), subscription.Lease);
    }

    [Fact]
    public async Task TickAsync_CachesResolvedChannelIdAcrossPolls()
    {
        var client = new TestYouTubeClient
        {
            ResolvedChannelId = "channel-123",
        };
        client.LiveResults.Enqueue(new YouTubeLiveResult(false, null));
        client.LiveResults.Enqueue(new YouTubeLiveResult(false, null));
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var service = new YouTubeWebSubService(
            client,
            LiveTestHelpers.CreateBroadcaster(),
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                YouTube = new YouTubeOptions
                {
                    ApiKey = "api-key",
                    ChannelHandle = "@aspiredotdev",
                },
            }),
            NullLogger<YouTubeWebSubService>.Instance,
            time);

        await service.TickAsync(CancellationToken.None);
        time.Advance(TimeSpan.FromMinutes(30));
        await service.TickAsync(CancellationToken.None);

        Assert.Equal(1, client.ResolveChannelIdCalls);
        Assert.Equal(["channel-123", "channel-123"], client.LiveLookups);
    }

    [Fact]
    public async Task TickAsync_RequiresConfiguredOfflineConfirmationCountBeforeBroadcastingOffline()
    {
        var client = new TestYouTubeClient();
        client.VideoResults.Enqueue(new YouTubeLiveResult(false, null));
        client.VideoResults.Enqueue(new YouTubeLiveResult(false, null));
        var broadcaster = LiveTestHelpers.CreateBroadcaster();
        broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "video-123") });
        var service = new YouTubeWebSubService(
            client,
            broadcaster,
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                YouTube = new YouTubeOptions
                {
                    ApiKey = "api-key",
                    ChannelId = "channel-123",
                    OfflineConfirmationCount = 2,
                },
            }),
            NullLogger<YouTubeWebSubService>.Instance,
            new FakeTimeProvider(DateTimeOffset.UnixEpoch));

        await service.TickAsync(CancellationToken.None);

        Assert.True(broadcaster.Current.YouTube.Live);

        await service.TickAsync(CancellationToken.None);

        Assert.False(broadcaster.Current.YouTube.Live);
        Assert.Null(broadcaster.Current.YouTube.VideoId);
        Assert.Equal(["video-123", "video-123"], client.VideoLookups);
        Assert.Empty(client.LiveLookups);
    }

    [Fact]
    public async Task TickAsync_UsesLowCostLookupWhileStreamIsLive()
    {
        var client = new TestYouTubeClient();
        client.VideoResults.Enqueue(new YouTubeLiveResult(true, "video-123"));
        var broadcaster = LiveTestHelpers.CreateBroadcaster();
        broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "video-123") });
        var service = new YouTubeWebSubService(
            client,
            broadcaster,
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                YouTube = new YouTubeOptions
                {
                    ApiKey = "api-key",
                    ChannelId = "channel-123",
                },
            }),
            NullLogger<YouTubeWebSubService>.Instance,
            new FakeTimeProvider(DateTimeOffset.UnixEpoch));

        await service.TickAsync(CancellationToken.None);

        Assert.Equal(["video-123"], client.VideoLookups);
        Assert.Empty(client.LiveLookups);
        Assert.True(broadcaster.Current.YouTube.Live);
    }

    [Fact]
    public async Task TickAsync_ThrottlesDiscoveryAfterFailedSearch()
    {
        var client = new TestYouTubeClient
        {
            LiveLookupException = new HttpRequestException("quota unavailable"),
        };
        var service = new YouTubeWebSubService(
            client,
            LiveTestHelpers.CreateBroadcaster(),
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                YouTube = new YouTubeOptions
                {
                    ApiKey = "api-key",
                    ChannelId = "channel-123",
                },
            }),
            NullLogger<YouTubeWebSubService>.Instance,
            new FakeTimeProvider(DateTimeOffset.UnixEpoch));

        await Assert.ThrowsAsync<HttpRequestException>(() => service.TickAsync(CancellationToken.None));
        await service.TickAsync(CancellationToken.None);

        Assert.Equal(["channel-123"], client.LiveLookups);
    }

    [Fact]
    public async Task TickAsync_ResetsOfflineConfirmationForNewLiveVideo()
    {
        var client = new TestYouTubeClient();
        client.VideoResults.Enqueue(new YouTubeLiveResult(false, null));
        client.VideoResults.Enqueue(new YouTubeLiveResult(false, null));
        client.VideoResults.Enqueue(new YouTubeLiveResult(false, null));
        var broadcaster = LiveTestHelpers.CreateBroadcaster();
        broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "video-old") });
        var service = new YouTubeWebSubService(
            client,
            broadcaster,
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                YouTube = new YouTubeOptions
                {
                    ApiKey = "api-key",
                    ChannelId = "channel-123",
                    OfflineConfirmationCount = 2,
                },
            }),
            NullLogger<YouTubeWebSubService>.Instance,
            new FakeTimeProvider(DateTimeOffset.UnixEpoch));

        await service.TickAsync(CancellationToken.None);
        broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "video-new") });
        await service.TickAsync(CancellationToken.None);

        Assert.True(broadcaster.Current.YouTube.Live);
        Assert.Equal("video-new", broadcaster.Current.YouTube.VideoId);

        await service.TickAsync(CancellationToken.None);

        Assert.False(broadcaster.Current.YouTube.Live);
    }

    [Fact]
    public void SubscriptionState_AcceptsOnlyPendingSubscribeAndUsesGrantedLease()
    {
        var now = DateTimeOffset.UnixEpoch;
        var state = new YouTubeWebSubSubscriptionState();
        var request = state.BeginSubscription("channel-123", now);

        Assert.False(state.TryConfirmSubscription(
            "unsubscribe",
            request.Topic,
            request.VerifyToken,
            (int)TimeSpan.FromDays(5).TotalSeconds,
            now));
        Assert.False(state.TryConfirmSubscription(
            "subscribe",
            request.Topic,
            "wrong-token",
            (int)TimeSpan.FromDays(5).TotalSeconds,
            now));
        Assert.True(state.TryConfirmSubscription(
            "subscribe",
            request.Topic,
            request.VerifyToken,
            (int)TimeSpan.FromDays(5).TotalSeconds,
            now));
        Assert.Equal(now.AddDays(4), state.RenewAt);
        Assert.False(state.ShouldRequestSubscription("channel-123", now.AddDays(3)));
        Assert.True(state.ShouldRequestSubscription("channel-123", now.AddDays(4)));

        var shortLeaseState = new YouTubeWebSubSubscriptionState();
        var shortLeaseRequest = shortLeaseState.BeginSubscription("channel-123", now);
        Assert.True(shortLeaseState.TryConfirmSubscription(
            "subscribe",
            shortLeaseRequest.Topic,
            shortLeaseRequest.VerifyToken,
            30,
            now));
        Assert.Equal(now.AddSeconds(24), shortLeaseState.RenewAt);
    }

    [Fact]
    public async Task ConfirmYouTubeLiveStatusAsync_ResolvesChannelIdBeforePollingWhenOptionEmpty()
    {
        var client = new TestYouTubeClient
        {
            ResolvedChannelId = "channel-123",
        };
        client.LiveResults.Enqueue(new YouTubeLiveResult(true, "video-123"));
        var broadcaster = LiveTestHelpers.CreateBroadcaster();

        await LiveStatusEndpointRouteBuilderExtensions.ConfirmYouTubeLiveStatusAsync(
            new YouTubeOptions
            {
                ChannelHandle = "@aspiredotdev",
            },
            client,
            broadcaster,
            NullLogger.Instance,
            CancellationToken.None);

        Assert.True(broadcaster.Current.YouTube.Live);
        Assert.Equal("video-123", broadcaster.Current.YouTube.VideoId);
        Assert.Equal(1, client.ResolveChannelIdCalls);
        Assert.Equal(["channel-123"], client.LiveLookups);
    }

    private sealed class TestYouTubeClient : IYouTubeClient
    {
        public string? ResolvedChannelId { get; set; } = "channel-123";

        public Queue<YouTubeLiveResult> LiveResults { get; } = [];

        public Queue<YouTubeLiveResult> VideoResults { get; } = [];

        public Exception? LiveLookupException { get; set; }

        public List<Subscription> Subscriptions { get; } = [];

        public int ResolveChannelIdCalls { get; private set; }

        public List<string> LiveLookups { get; } = [];

        public List<string> VideoLookups { get; } = [];

        public Task<string?> ResolveChannelIdAsync(string handle, CancellationToken cancellationToken)
        {
            ResolveChannelIdCalls++;
            return Task.FromResult(ResolvedChannelId);
        }

        public Task<YouTubeLiveResult> GetCurrentLiveAsync(string channelId, CancellationToken cancellationToken)
        {
            LiveLookups.Add(channelId);
            if (LiveLookupException is not null)
            {
                throw LiveLookupException;
            }

            return Task.FromResult(LiveResults.Count > 0 ? LiveResults.Dequeue() : new YouTubeLiveResult(false, null));
        }

        public Task<YouTubeLiveResult> GetVideoLiveStatusAsync(string videoId, CancellationToken cancellationToken)
        {
            VideoLookups.Add(videoId);
            return Task.FromResult(VideoResults.Count > 0 ? VideoResults.Dequeue() : new YouTubeLiveResult(false, null));
        }

        public Task SubscribeAsync(
            string channelId,
            string callbackUrl,
            string secret,
            string verifyToken,
            TimeSpan lease,
            CancellationToken cancellationToken)
        {
            Subscriptions.Add(new Subscription(channelId, callbackUrl, secret, verifyToken, lease));
            return Task.CompletedTask;
        }
    }

    private sealed record Subscription(
        string ChannelId,
        string CallbackUrl,
        string Secret,
        string VerifyToken,
        TimeSpan Lease);
}
