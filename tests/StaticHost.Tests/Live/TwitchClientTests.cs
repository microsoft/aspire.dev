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

    [Theory]
    [InlineData("user")]
    [InlineData("stream")]
    [InlineData("list")]
    [InlineData("create")]
    [InlineData("delete")]
    public async Task HelixOperation_RefreshesRejectedTokenAndRetriesSameRequestOnce(string operation)
    {
        var tokenCount = 0;
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse(
                $$"""{"access_token":"token-{{++tokenCount}}","expires_in":3600}"""));
        var requestCount = 0;
        var helixHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"data":[]}""",
                ++requestCount == 1 ? HttpStatusCode.Unauthorized : HttpStatusCode.OK));
        var client = CreateClient(helixHandler, tokenHandler);

        await InvokeOperationAsync(client, operation);

        Assert.Equal(2, tokenCount);
        Assert.Equal(2, helixHandler.Requests.Count);
        var first = helixHandler.Requests[0];
        var retry = helixHandler.Requests[1];
        Assert.Equal(first.Method, retry.Method);
        Assert.Equal(first.RequestUri, retry.RequestUri);
        Assert.Equal(first.Content, retry.Content);
        Assert.Equal("Bearer token-1", first.Header("Authorization"));
        Assert.Equal("Bearer token-2", retry.Header("Authorization"));
        Assert.Equal("client-id", retry.Header("Client-Id"));
    }

    [Fact]
    public async Task HelixOperation_StopsAfterSecondUnauthorizedAndInvalidatesRejectedReplacement()
    {
        var tokenCount = 0;
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse(
                $$"""{"access_token":"token-{{++tokenCount}}","expires_in":3600}"""));
        var reject = true;
        var helixHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"data":[]}""",
                reject ? HttpStatusCode.Unauthorized : HttpStatusCode.OK));
        var client = CreateClient(helixHandler, tokenHandler);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(
            () => client.GetStreamAsync("user-123", CancellationToken.None));

        Assert.Equal(HttpStatusCode.Unauthorized, exception.StatusCode);
        Assert.Equal(2, helixHandler.Requests.Count);
        Assert.Equal(2, tokenCount);

        reject = false;
        await client.GetStreamAsync("user-123", CancellationToken.None);
        Assert.Equal(3, tokenCount);
        Assert.Equal("Bearer token-3", helixHandler.Requests[2].Header("Authorization"));
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task HelixOperation_DoesNotRefreshForOtherFailures(HttpStatusCode status)
    {
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"access_token":"token-1","expires_in":3600}"""));
        var helixHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""{"error":"request failed"}""", status));
        var client = CreateClient(helixHandler, tokenHandler);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(
            () => client.GetStreamAsync("user-123", CancellationToken.None));

        Assert.Equal(status, exception.StatusCode);
        Assert.Single(helixHandler.Requests);
        Assert.Single(tokenHandler.Requests);
    }

    [Fact]
    public async Task HelixOperation_LateUnauthorizedDoesNotDiscardConcurrentReplacement()
    {
        var firstRequestStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseFirstResponse = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tokenCount = 0;
        var tokenHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse(
                $$"""{"access_token":"token-{{++tokenCount}}","expires_in":3600}"""));
        var requestCount = 0;
        var helixHandler = new AsyncHttpMessageHandler(async (request, cancellationToken) =>
        {
            if (Interlocked.Increment(ref requestCount) == 1)
            {
                firstRequestStarted.SetResult();
                await releaseFirstResponse.Task.WaitAsync(cancellationToken);
                return LiveTestHelpers.JsonResponse("{}", HttpStatusCode.Unauthorized);
            }

            return LiveTestHelpers.JsonResponse("""{"data":[]}""",
                request.Headers.Authorization?.Parameter == "token-1"
                    ? HttpStatusCode.Unauthorized
                    : HttpStatusCode.OK);
        });
        var client = CreateClient(helixHandler, tokenHandler);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        var first = client.GetStreamAsync("user-123", timeout.Token);
        await firstRequestStarted.Task.WaitAsync(timeout.Token);
        await client.GetStreamAsync("user-123", timeout.Token);
        releaseFirstResponse.SetResult();
        await first;

        Assert.Equal(2, tokenCount);
        Assert.Equal(4, requestCount);
    }

    private static async Task InvokeOperationAsync(TwitchClient client, string operation)
    {
        switch (operation)
        {
            case "user":
                await client.GetUserByLoginAsync("aspiredev", CancellationToken.None);
                break;
            case "stream":
                await client.GetStreamAsync("user-123", CancellationToken.None);
                break;
            case "list":
                await client.ListEventSubAsync(CancellationToken.None);
                break;
            case "create":
                await client.CreateEventSubAsync("stream.online",
                    """{"broadcaster_user_id":"user-123"}""",
                    "https://example.com/api/live/twitch/webhook", "webhook-secret", CancellationToken.None);
                break;
            case "delete":
                await client.DeleteEventSubAsync("subscription-123", CancellationToken.None);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(operation));
        }
    }

    private sealed class AsyncHttpMessageHandler(
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) =>
            responder(request, cancellationToken);
    }

    private static TwitchClient CreateClient(
        HttpMessageHandler helixHandler,
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
