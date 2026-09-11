namespace StaticHost.Tests.Live;

public sealed class TwitchAppTokenProviderTests
{
    [Fact]
    public async Task GetAsync_PostsClientCredentialsAndCachesToken()
    {
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"access_token":"token-1","expires_in":3600}"""));
        var httpFactory = new TestHttpClientFactory();
        httpFactory.AddClient(TwitchAppTokenProvider.HttpClientName, tokenHandler);

        var options = new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
        {
            Twitch = new TwitchOptions
            {
                ClientId = "client-id",
                ClientSecret = "client-secret",
            },
        });
        var timeProvider = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var provider = new TwitchAppTokenProvider(
            httpFactory,
            options,
            NullLogger<TwitchAppTokenProvider>.Instance,
            timeProvider);

        var first = await provider.GetAsync(CancellationToken.None);
        var second = await provider.GetAsync(CancellationToken.None);

        Assert.Equal("token-1", first);
        Assert.Equal("token-1", second);
        var request = Assert.Single(tokenHandler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://id.twitch.tv/oauth2/token", request.RequestUri?.ToString());
        Assert.Contains("client_id=client-id", request.Content, StringComparison.Ordinal);
        Assert.Contains("client_secret=client-secret", request.Content, StringComparison.Ordinal);
        Assert.Contains("grant_type=client_credentials", request.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task GetAsync_RefreshesTokenNearExpiry()
    {
        var responseIndex = 0;
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
        {
            responseIndex++;
            return LiveTestHelpers.JsonResponse($$"""{"access_token":"token-{{responseIndex}}","expires_in":3600}""");
        });
        var httpFactory = new TestHttpClientFactory();
        httpFactory.AddClient(TwitchAppTokenProvider.HttpClientName, tokenHandler);

        var options = new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
        {
            Twitch = new TwitchOptions
            {
                ClientId = "client-id",
                ClientSecret = "client-secret",
            },
        });
        var timeProvider = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var provider = new TwitchAppTokenProvider(
            httpFactory,
            options,
            NullLogger<TwitchAppTokenProvider>.Instance,
            timeProvider);

        var first = await provider.GetAsync(CancellationToken.None);

        timeProvider.Advance(TimeSpan.FromMinutes(56));
        var second = await provider.GetAsync(CancellationToken.None);

        Assert.Equal("token-1", first);
        Assert.Equal("token-2", second);
        Assert.Equal(2, tokenHandler.Requests.Count);
    }
}
