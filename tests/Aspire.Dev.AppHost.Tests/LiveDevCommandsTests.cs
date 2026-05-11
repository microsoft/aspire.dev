namespace Aspire.Dev.AppHost.Tests;

public sealed class LiveDevCommandsTests
{
    [Fact]
    public async Task SetStatus_AddsCommandSecretHeaderAndJsonBody()
    {
        var options = LiveDevCommands.SetStatus(
            "command-secret",
            "description",
            """{"youtube":{"live":false,"videoId":null}}""",
            iconName: "VideoOff");
        var context = CreateContext();
        var request = context.Request;

        await options.PrepareRequest!(context);

        Assert.Equal(HttpMethod.Post, options.Method);
        Assert.Equal("VideoOff", options.IconName);
        Assert.Equal("Key: command-secret", request.Headers.GetValues(LiveDevCommands.CommandSecretHeaderName).Single());
        Assert.NotNull(request.Content);
        Assert.Equal("application/json", request.Content.Headers.ContentType?.MediaType);
        Assert.Equal("""{"youtube":{"live":false,"videoId":null}}""", await request.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task TwitchWebhook_AddsValidEventSubSignatureAndNotificationPayload()
    {
        var options = LiveDevCommands.TwitchWebhook(
            "command-secret",
            "webhook-secret",
            "description",
            "stream.online");
        var context = CreateContext();
        var request = context.Request;

        await options.PrepareRequest!(context);

        var body = Encoding.UTF8.GetBytes(await request.Content!.ReadAsStringAsync());
        var messageId = request.Headers.GetValues("Twitch-Eventsub-Message-Id").Single();
        var timestamp = request.Headers.GetValues("Twitch-Eventsub-Message-Timestamp").Single();
        var signature = request.Headers.GetValues("Twitch-Eventsub-Message-Signature").Single();

        Assert.Equal(HttpMethod.Post, options.Method);
        Assert.Equal("PlugConnected", options.IconName);
        Assert.Equal("notification", request.Headers.GetValues("Twitch-Eventsub-Message-Type").Single());
        Assert.Equal("Key: command-secret", request.Headers.GetValues(LiveDevCommands.CommandSecretHeaderName).Single());
        Assert.True(TwitchWebhookHandler.IsValidSignature("webhook-secret", messageId, timestamp, body, signature));
        Assert.Contains("\"type\": \"stream.online\"", Encoding.UTF8.GetString(body), StringComparison.Ordinal);
    }

    [Fact]
    public async Task YouTubeWebhook_AddsValidWebSubSignatureAndAtomPayload()
    {
        var options = LiveDevCommands.YouTubeWebhook(
            "command-secret",
            "webhook-secret",
            "description",
            "dev-live-video");
        var context = CreateContext();
        var request = context.Request;

        await options.PrepareRequest!(context);

        var body = Encoding.UTF8.GetBytes(await request.Content!.ReadAsStringAsync());
        var signature = request.Headers.GetValues("X-Hub-Signature").Single();

        Assert.Equal(HttpMethod.Post, options.Method);
        Assert.Equal("ArrowSync", options.IconName);
        Assert.Equal("Key: command-secret", request.Headers.GetValues(LiveDevCommands.CommandSecretHeaderName).Single());
        Assert.True(YouTubeWebhookHandler.IsValidSignature("webhook-secret", body, signature));
        Assert.Equal("dev-live-video", YouTubeWebhookHandler.ExtractVideoId(body));
        Assert.Equal("application/atom+xml", request.Content.Headers.ContentType?.MediaType);
    }

    private static HttpCommandRequestContext CreateContext() =>
        new()
        {
            ServiceProvider = new ServiceCollection().BuildServiceProvider(),
            ResourceName = "aspiredev",
            Endpoint = null!,
            CancellationToken = CancellationToken.None,
            HttpClient = new HttpClient(),
            Request = new HttpRequestMessage(),
        };
}
