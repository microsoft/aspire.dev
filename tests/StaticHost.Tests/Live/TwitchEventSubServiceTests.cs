namespace StaticHost.Tests.Live;

public sealed class TwitchEventSubServiceTests
{
    [Fact]
    public async Task ReconcileAsync_CreatesMissingSubscriptionAndDeletesStaleSubscription()
    {
        var client = new TestTwitchClient
        {
            User = new TwitchUser("user-123", "aspiredotdev", "Aspire"),
            Stream = new TwitchStreamInfo(true, "Live now"),
            Subscriptions =
            [
                new TwitchEventSubSubscription(
                    "online-existing",
                    "stream.online",
                    "enabled",
                    "https://example.com/api/live/twitch/webhook",
                    "user-123"),
                new TwitchEventSubSubscription(
                    "offline-stale",
                    "stream.offline",
                    "authorization_revoked",
                    "https://old.example.com/api/live/twitch/webhook",
                    "user-123"),
            ],
        };
        var broadcaster = LiveTestHelpers.CreateBroadcaster();
        var service = new TwitchEventSubService(
            client,
            broadcaster,
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                PublicBaseUrl = "https://example.com/",
                Twitch = new TwitchOptions
                {
                    ClientId = "client-id",
                    ClientSecret = "client-secret",
                    WebhookSecret = "webhook-secret",
                    ChannelLogin = "aspiredotdev",
                },
            }),
            NullLogger<TwitchEventSubService>.Instance);

        await service.ReconcileAsync(CancellationToken.None);

        Assert.True(broadcaster.Current.Twitch.Live);
        Assert.Equal("Live now", broadcaster.Current.Twitch.Title);
        var created = Assert.Single(client.CreatedSubscriptions);
        Assert.Equal("stream.offline", created.Type);
        Assert.Equal("""{"broadcaster_user_id":"user-123"}""", created.Condition);
        Assert.Equal("https://example.com/api/live/twitch/webhook", created.CallbackUrl);
        Assert.Equal("webhook-secret", created.Secret);
        Assert.Equal(["offline-stale"], client.DeletedSubscriptions);
    }

    [Fact]
    public async Task ReconcileAsync_CachesResolvedChannelIdAcrossReconciles()
    {
        var client = new TestTwitchClient
        {
            User = new TwitchUser("user-123", "aspiredotdev", "Aspire"),
            Stream = new TwitchStreamInfo(false, null),
        };
        var service = new TwitchEventSubService(
            client,
            LiveTestHelpers.CreateBroadcaster(),
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                PublicBaseUrl = "https://example.com/",
                Twitch = new TwitchOptions
                {
                    ClientId = "client-id",
                    ClientSecret = "client-secret",
                    WebhookSecret = "webhook-secret",
                    ChannelLogin = "aspiredotdev",
                },
            }),
            NullLogger<TwitchEventSubService>.Instance);

        await service.ReconcileAsync(CancellationToken.None);
        await service.ReconcileAsync(CancellationToken.None);

        Assert.Equal(1, client.UserLookupCount);
        Assert.Equal(["user-123", "user-123"], client.StreamLookups);
    }

    [Fact]
    public async Task ReconcileAsync_SkipsEventSubReconciliationWhenWebhookSecretMissing()
    {
        var client = new TestTwitchClient
        {
            User = new TwitchUser("user-123", "aspiredotdev", "Aspire"),
            Stream = new TwitchStreamInfo(true, "Live now"),
        };
        var broadcaster = LiveTestHelpers.CreateBroadcaster();
        var service = new TwitchEventSubService(
            client,
            broadcaster,
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                PublicBaseUrl = "https://example.com/",
                Twitch = new TwitchOptions
                {
                    ClientId = "client-id",
                    ClientSecret = "client-secret",
                    ChannelLogin = "aspiredotdev",
                },
            }),
            NullLogger<TwitchEventSubService>.Instance);

        await service.ReconcileAsync(CancellationToken.None);

        Assert.True(broadcaster.Current.Twitch.Live);
        Assert.Empty(client.CreatedSubscriptions);
        Assert.Empty(client.DeletedSubscriptions);
        Assert.Equal(0, client.ListEventSubCount);
    }

    [Fact]
    public async Task ReconcileAsync_ReplacesSubscriptionForDifferentBroadcaster()
    {
        var client = new TestTwitchClient
        {
            User = new TwitchUser("user-123", "aspiredotdev", "Aspire"),
            Stream = new TwitchStreamInfo(false, null),
            Subscriptions =
            [
                new TwitchEventSubSubscription(
                    "wrong-online",
                    "stream.online",
                    "enabled",
                    "https://example.com/api/live/twitch/webhook",
                    "other-user"),
                new TwitchEventSubSubscription(
                    "offline-existing",
                    "stream.offline",
                    "enabled",
                    "https://example.com/api/live/twitch/webhook",
                    "user-123"),
            ],
        };
        var service = new TwitchEventSubService(
            client,
            LiveTestHelpers.CreateBroadcaster(),
            new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
            {
                PublicBaseUrl = "https://example.com/",
                Twitch = new TwitchOptions
                {
                    ClientId = "client-id",
                    ClientSecret = "client-secret",
                    WebhookSecret = "webhook-secret",
                    ChannelLogin = "aspiredotdev",
                },
            }),
            NullLogger<TwitchEventSubService>.Instance);

        await service.ReconcileAsync(CancellationToken.None);

        var created = Assert.Single(client.CreatedSubscriptions);
        Assert.Equal("stream.online", created.Type);
        Assert.Equal(["wrong-online"], client.DeletedSubscriptions);
    }

    private sealed class TestTwitchClient : ITwitchClient
    {
        public TwitchUser? User { get; set; }

        public TwitchStreamInfo Stream { get; set; } = new(false, null);

        public IReadOnlyList<TwitchEventSubSubscription> Subscriptions { get; set; } = [];

        public List<CreatedSubscription> CreatedSubscriptions { get; } = [];

        public List<string> DeletedSubscriptions { get; } = [];

        public int UserLookupCount { get; private set; }

        public List<string> StreamLookups { get; } = [];

        public int ListEventSubCount { get; private set; }

        public Task<TwitchUser?> GetUserByLoginAsync(string login, CancellationToken cancellationToken)
        {
            UserLookupCount++;
            return Task.FromResult(User);
        }

        public Task<TwitchStreamInfo> GetStreamAsync(string userId, CancellationToken cancellationToken)
        {
            StreamLookups.Add(userId);
            return Task.FromResult(Stream);
        }

        public Task<IReadOnlyList<TwitchEventSubSubscription>> ListEventSubAsync(CancellationToken cancellationToken)
        {
            ListEventSubCount++;
            return Task.FromResult(Subscriptions);
        }

        public Task CreateEventSubAsync(string type, string condition, string callbackUrl, string secret, CancellationToken cancellationToken)
        {
            CreatedSubscriptions.Add(new CreatedSubscription(type, condition, callbackUrl, secret));
            return Task.CompletedTask;
        }

        public Task DeleteEventSubAsync(string id, CancellationToken cancellationToken)
        {
            DeletedSubscriptions.Add(id);
            return Task.CompletedTask;
        }
    }

    private sealed record CreatedSubscription(string Type, string Condition, string CallbackUrl, string Secret);
}
