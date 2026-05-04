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
        Assert.Equal(TimeSpan.FromDays(5), subscription.Lease);
    }

    [Fact]
    public async Task TickAsync_RequiresConfiguredOfflineConfirmationCountBeforeBroadcastingOffline()
    {
        var client = new TestYouTubeClient();
        client.LiveResults.Enqueue(new YouTubeLiveResult(false, null));
        client.LiveResults.Enqueue(new YouTubeLiveResult(false, null));
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
    }

    private sealed class TestYouTubeClient : IYouTubeClient
    {
        public string? ResolvedChannelId { get; set; } = "channel-123";

        public Queue<YouTubeLiveResult> LiveResults { get; } = [];

        public List<Subscription> Subscriptions { get; } = [];

        public Task<string?> ResolveChannelIdAsync(string handle, CancellationToken cancellationToken) =>
            Task.FromResult(ResolvedChannelId);

        public Task<YouTubeLiveResult> GetCurrentLiveAsync(string channelId, CancellationToken cancellationToken) =>
            Task.FromResult(LiveResults.Count > 0 ? LiveResults.Dequeue() : new YouTubeLiveResult(false, null));

        public Task SubscribeAsync(string channelId, string callbackUrl, string secret, TimeSpan lease, CancellationToken cancellationToken)
        {
            Subscriptions.Add(new Subscription(channelId, callbackUrl, secret, lease));
            return Task.CompletedTask;
        }
    }

    private sealed record Subscription(string ChannelId, string CallbackUrl, string Secret, TimeSpan Lease);
}
