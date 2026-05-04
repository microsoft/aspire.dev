namespace StaticHost.Tests.Live;

public sealed class TwitchClientTests
{
    [Fact]
    public async Task GetUserByLoginAsync_RequestsEscapedLoginAndMapsFirstUser()
    {
        var helixHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""
            {
              "data": [
                {
                  "id": "123",
                  "login": "aspiredev",
                  "display_name": "Aspire"
                }
              ]
            }
            """));
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"access_token":"token-1","expires_in":3600}"""));
        var client = CreateClient(helixHandler, tokenHandler);

        var user = await client.GetUserByLoginAsync("aspire dev", CancellationToken.None);

        Assert.NotNull(user);
        Assert.Equal("123", user.Id);
        Assert.Equal("aspiredev", user.Login);
        Assert.Equal("Aspire", user.DisplayName);

        var request = Assert.Single(helixHandler.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("https://api.twitch.tv/helix/users?login=aspire%20dev", request.RequestUri?.AbsoluteUri);
        Assert.Equal("Bearer token-1", request.Header("Authorization"));
        Assert.Equal("client-id", request.Header("Client-Id"));
    }

    [Fact]
    public async Task GetStreamAsync_ReturnsOfflineWhenHelixHasNoStream()
    {
        var helixHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"data":[]}"""));
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"access_token":"token-1","expires_in":3600}"""));
        var client = CreateClient(helixHandler, tokenHandler);

        var stream = await client.GetStreamAsync("user-123", CancellationToken.None);

        Assert.False(stream.Live);
        Assert.Null(stream.Title);
        var request = Assert.Single(helixHandler.Requests);
        Assert.Equal("https://api.twitch.tv/helix/streams?user_id=user-123", request.RequestUri?.ToString());
    }

    [Fact]
    public async Task CreateEventSubAsync_PostsWebhookSubscriptionPayload()
    {
        var helixHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"data":[]}""", System.Net.HttpStatusCode.Accepted));
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"access_token":"token-1","expires_in":3600}"""));
        var client = CreateClient(helixHandler, tokenHandler);

        await client.CreateEventSubAsync(
            "stream.online",
            """{"broadcaster_user_id":"user-123"}""",
            "https://example.com/api/live/twitch/webhook",
            "webhook-secret",
            CancellationToken.None);

        var request = Assert.Single(helixHandler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://api.twitch.tv/helix/eventsub/subscriptions", request.RequestUri?.ToString());
        Assert.Contains("\"type\":\"stream.online\"", request.Content, StringComparison.Ordinal);
        Assert.Contains("\"broadcaster_user_id\":\"user-123\"", request.Content, StringComparison.Ordinal);
        Assert.Contains("\"callback\":\"https://example.com/api/live/twitch/webhook\"", request.Content, StringComparison.Ordinal);
        Assert.Contains("\"secret\":\"webhook-secret\"", request.Content, StringComparison.Ordinal);
    }

    private static TwitchClient CreateClient(
        RecordingHttpMessageHandler helixHandler,
        RecordingHttpMessageHandler tokenHandler)
    {
        var httpFactory = new TestHttpClientFactory();
        httpFactory.AddClient(TwitchClient.HttpClientName, helixHandler);
        httpFactory.AddClient(TwitchAppTokenProvider.HttpClientName, tokenHandler);

        var options = new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
        {
            Twitch = new TwitchOptions
            {
                ClientId = "client-id",
                ClientSecret = "client-secret",
            },
        });
        var tokenProvider = new TwitchAppTokenProvider(
            httpFactory,
            options,
            NullLogger<TwitchAppTokenProvider>.Instance);

        return new TwitchClient(httpFactory, tokenProvider, options, NullLogger<TwitchClient>.Instance);
    }
}
