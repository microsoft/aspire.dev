namespace StaticHost.Tests.Live;

public sealed class YouTubeClientTests
{
    [Fact]
    public async Task ResolveChannelIdAsync_RequestsHandleWithoutAtSignAndMapsFirstItem()
    {
        var apiHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""
            {
              "items": [
                { "id": "channel-123" }
              ]
            }
            """));
        var client = CreateClient(apiHandler: apiHandler, apiKey: "api-key");

        var channelId = await client.ResolveChannelIdAsync("@aspiredotdev", CancellationToken.None);

        Assert.Equal("channel-123", channelId);
        var request = Assert.Single(apiHandler.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal(
            "https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=aspiredotdev&key=api-key",
            request.RequestUri?.ToString());
    }

    [Fact]
    public async Task ResolveChannelIdAsync_ReturnsNullWhenApiKeyIsMissing()
    {
        var client = CreateClient(apiKey: "");

        var channelId = await client.ResolveChannelIdAsync("@aspiredotdev", CancellationToken.None);

        Assert.Null(channelId);
    }

    [Fact]
    public async Task GetCurrentLiveAsync_ReturnsLiveVideoId()
    {
        var apiHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse("""
            {
              "items": [
                {
                  "id": { "videoId": "video-123" }
                }
              ]
            }
            """));
        var client = CreateClient(apiHandler: apiHandler, apiKey: "api-key");

        var live = await client.GetCurrentLiveAsync("channel-123", CancellationToken.None);

        Assert.True(live.Live);
        Assert.Equal("video-123", live.VideoId);
        var request = Assert.Single(apiHandler.Requests);
        Assert.Equal(
            "https://www.googleapis.com/youtube/v3/search?part=id&channelId=channel-123&eventType=live&type=video&key=api-key",
            request.RequestUri?.ToString());
    }

    [Fact]
    public async Task SubscribeAsync_PostsExpectedHubForm()
    {
        var pubSubHandler = new RecordingHttpMessageHandler(_ =>
            new HttpResponseMessage(System.Net.HttpStatusCode.Accepted));
        var client = CreateClient(pubSubHandler: pubSubHandler);

        await client.SubscribeAsync(
            "channel-123",
            "https://example.com/api/live/youtube/webhook",
            "webhook-secret",
            TimeSpan.FromDays(5),
            CancellationToken.None);

        var request = Assert.Single(pubSubHandler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://pubsubhubbub.appspot.com/subscribe", request.RequestUri?.ToString());
        Assert.Contains("hub.mode=subscribe", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.verify=async", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.secret=webhook-secret", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.lease_seconds=432000", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.callback=https%3A%2F%2Fexample.com%2Fapi%2Flive%2Fyoutube%2Fwebhook", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.topic=https%3A%2F%2Fwww.youtube.com%2Fxml%2Ffeeds%2Fvideos.xml%3Fchannel_id%3Dchannel-123", request.Content, StringComparison.Ordinal);
    }

    private static YouTubeClient CreateClient(
        RecordingHttpMessageHandler? apiHandler = null,
        RecordingHttpMessageHandler? pubSubHandler = null,
        string apiKey = "api-key")
    {
        var httpFactory = new TestHttpClientFactory();

        if (apiHandler is not null)
        {
            httpFactory.AddClient(YouTubeClient.HttpClientName, apiHandler);
        }

        if (pubSubHandler is not null)
        {
            httpFactory.AddClient(YouTubeClient.PubSubHttpClientName, pubSubHandler);
        }

        var options = new TestOptionsMonitor<LiveStatusOptions>(new LiveStatusOptions
        {
            YouTube = new YouTubeOptions
            {
                ApiKey = apiKey,
            },
        });

        return new YouTubeClient(httpFactory, options, NullLogger<YouTubeClient>.Instance);
    }
}
