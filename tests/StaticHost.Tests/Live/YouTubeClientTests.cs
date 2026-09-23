using Microsoft.Extensions.Hosting;

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

    [Theory]
    [InlineData(false, null)]
    [InlineData(true, "2026-08-27T15:00:00Z")]
    public async Task GetVideoLiveStatusAsync_UsesLowCostVideoLookup(
        bool ended,
        string? actualEndTime)
    {
        var endProperty = ended ? $""","actualEndTime":"{actualEndTime}" """ : "";
        var apiHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse($$"""
            {
              "items": [
                {
                  "liveStreamingDetails": {
                    "actualStartTime": "2026-08-27T14:00:00Z"
                    {{endProperty}}
                  }
                }
              ]
            }
            """));
        var client = CreateClient(apiHandler: apiHandler, apiKey: "api-key");

        var live = await client.GetVideoLiveStatusAsync("video-123", CancellationToken.None);

        Assert.Equal(!ended, live.Live);
        Assert.Equal(ended ? null : "video-123", live.VideoId);
        var request = Assert.Single(apiHandler.Requests);
        Assert.Equal(
            "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=video-123&key=api-key",
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
            "verify-token",
            TimeSpan.FromDays(5),
            CancellationToken.None);

        var request = Assert.Single(pubSubHandler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://pubsubhubbub.appspot.com/subscribe", request.RequestUri?.ToString());
        Assert.Contains("hub.mode=subscribe", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.verify=async", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.verify_token=verify-token", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.secret=webhook-secret", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.lease_seconds=432000", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.callback=https%3A%2F%2Fexample.com%2Fapi%2Flive%2Fyoutube%2Fwebhook", request.Content, StringComparison.Ordinal);
        Assert.Contains("hub.topic=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3Dchannel-123", request.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PubSubHttpClient_HasBoundedTimeoutAndDoesNotRetryPosts()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.AddLiveStatus();
        var handler = new RecordingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        builder.Services.AddHttpClient(YouTubeClient.PubSubHttpClientName)
            .ConfigurePrimaryHttpMessageHandler(() => handler);
        using var host = builder.Build();
        var client = host.Services.GetRequiredService<IHttpClientFactory>()
            .CreateClient(YouTubeClient.PubSubHttpClientName);
        using var form = new FormUrlEncodedContent([]);

        using var response = await client.PostAsync("https://pubsubhubbub.appspot.com/subscribe", form);

        Assert.Equal(TimeSpan.FromSeconds(30), client.Timeout);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Single(handler.Requests);
    }

    [Theory]
    [InlineData(YouTubeClient.HttpClientName, HttpStatusCode.OK, true)]
    [InlineData(YouTubeClient.HttpClientName, HttpStatusCode.OK, false)]
    [InlineData(YouTubeClient.HttpClientName, HttpStatusCode.BadRequest, true)]
    [InlineData(YouTubeClient.HttpClientName, HttpStatusCode.BadRequest, false)]
    [InlineData(YouTubeClient.PubSubHttpClientName, HttpStatusCode.OK, true)]
    [InlineData(YouTubeClient.PubSubHttpClientName, HttpStatusCode.OK, false)]
    [InlineData(YouTubeClient.PubSubHttpClientName, HttpStatusCode.BadRequest, true)]
    [InlineData(YouTubeClient.PubSubHttpClientName, HttpStatusCode.BadRequest, false)]
    public async Task NamedYouTubeClients_BoundResponseBuffering(
        string clientName, HttpStatusCode status, bool hasContentLength)
    {
        var builder = Host.CreateApplicationBuilder();
        builder.AddLiveStatus();
        using var content = new OversizedContent(hasContentLength);
        var handler = new RecordingHttpMessageHandler(_ => new HttpResponseMessage(status) { Content = content });
        builder.Services.AddHttpClient(clientName).ConfigurePrimaryHttpMessageHandler(() => handler);
        using var host = builder.Build();
        using var client = host.Services.GetRequiredService<IHttpClientFactory>().CreateClient(clientName);
        using var request = new HttpRequestMessage(
            clientName == YouTubeClient.PubSubHttpClientName ? HttpMethod.Post : HttpMethod.Get,
            "https://example.com/provider");

        Assert.Equal(YouTubeClient.ResponseBufferLimit, client.MaxResponseContentBufferSize);
        await Assert.ThrowsAsync<HttpRequestException>(() => client.SendAsync(request));

        Assert.Single(handler.Requests);
        Assert.InRange(content.BytesAttempted, 0, YouTubeClient.ResponseBufferLimit + 1024);
        if (!hasContentLength)
        {
            Assert.True(content.BytesAttempted > YouTubeClient.ResponseBufferLimit);
        }
    }

    private sealed class OversizedContent(bool hasContentLength) : HttpContent
    {
        public int BytesAttempted { get; private set; }

        protected override bool TryComputeLength(out long length)
        {
            length = YouTubeClient.ResponseBufferLimit * 2;
            return hasContentLength;
        }

        protected override async Task SerializeToStreamAsync(Stream stream, System.Net.TransportContext? context)
        {
            var chunk = new byte[1024];
            for (var written = 0; written < YouTubeClient.ResponseBufferLimit * 2; written += chunk.Length)
            {
                BytesAttempted += chunk.Length;
                await stream.WriteAsync(chunk);
            }
        }
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
