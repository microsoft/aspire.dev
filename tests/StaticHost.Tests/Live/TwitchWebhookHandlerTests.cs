namespace StaticHost.Tests.Live;

public sealed class TwitchWebhookHandlerTests
{
    private const string Secret = "topsecret-123";

    [Fact]
    public void IsValidSignature_ReturnsTrueForCorrectlyComputedSignature()
    {
        var messageId = "msg-1";
        var timestamp = "2026-04-27T20:00:00Z";
        var body = Encoding.UTF8.GetBytes("""{"subscription":{"type":"stream.online"}}""");

        var sig = ComputeTwitchSignature(Secret, messageId, timestamp, body);

        Assert.True(TwitchWebhookHandler.IsValidSignature(Secret, messageId, timestamp, body, $"sha256={sig}"));
    }

    [Fact]
    public void IsValidSignature_ReturnsFalseForTamperedBody()
    {
        var messageId = "msg-1";
        var timestamp = "2026-04-27T20:00:00Z";
        var body = Encoding.UTF8.GetBytes("""{"subscription":{"type":"stream.online"}}""");
        var sig = ComputeTwitchSignature(Secret, messageId, timestamp, body);

        var tampered = Encoding.UTF8.GetBytes("""{"subscription":{"type":"stream.offline"}}""");
        Assert.False(TwitchWebhookHandler.IsValidSignature(Secret, messageId, timestamp, tampered, $"sha256={sig}"));
    }

    [Fact]
    public void IsValidSignature_ReturnsFalseForWrongSecret()
    {
        var messageId = "msg-1";
        var timestamp = "2026-04-27T20:00:00Z";
        var body = Encoding.UTF8.GetBytes("hi");
        var sig = ComputeTwitchSignature("other-secret", messageId, timestamp, body);
        Assert.False(TwitchWebhookHandler.IsValidSignature(Secret, messageId, timestamp, body, $"sha256={sig}"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("md5=abc")]
    [InlineData("not-a-real-header")]
    public void IsValidSignature_RejectsMalformedHeaders(string header)
    {
        var body = Array.Empty<byte>();
        Assert.False(TwitchWebhookHandler.IsValidSignature(Secret, "m", "t", body, header));
    }

    [Fact]
    public async Task Handle_CallbackVerification_ReturnsChallenge()
    {
        var broadcaster = LiveTestHelpers.CreateBroadcaster();
        var result = TwitchWebhookHandler.Handle(
            "webhook_callback_verification",
            """{"challenge":"challenge-token"}""",
            broadcaster,
            new TwitchOptions(),
            NullLogger.Instance);

        var context = new DefaultHttpContext();
        context.RequestServices = new ServiceCollection()
            .AddLogging()
            .BuildServiceProvider();
        context.Response.Body = new MemoryStream();

        await result.ExecuteAsync(context);

        context.Response.Body.Position = 0;
        using var reader = new StreamReader(context.Response.Body);
        Assert.Equal("challenge-token", await reader.ReadToEndAsync());
        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
        Assert.Equal("text/plain", context.Response.ContentType);
    }

    [Fact]
    public void Handle_StreamOnlineNotification_UpdatesBroadcaster()
    {
        var broadcaster = LiveTestHelpers.CreateBroadcaster();

        TwitchWebhookHandler.Handle(
            "notification",
            """
            {
              "subscription": { "type": "stream.online" },
              "event": { "broadcaster_user_login": "aspiredotdev" }
            }
            """,
            broadcaster,
            new TwitchOptions(),
            NullLogger.Instance);

        Assert.True(broadcaster.Current.Twitch.Live);
        Assert.Equal("aspiredotdev", broadcaster.Current.Twitch.Channel);
        Assert.True(broadcaster.Current.IsLive);
        Assert.Equal("twitch", broadcaster.Current.PrimarySource);
    }

    [Fact]
    public void Handle_StreamOfflineNotification_UsesConfiguredLoginWhenEventOmitsIt()
    {
        var broadcaster = LiveTestHelpers.CreateBroadcaster();
        broadcaster.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "aspiredotdev", null) });

        TwitchWebhookHandler.Handle(
            "notification",
            """
            {
              "subscription": { "type": "stream.offline" },
              "event": { }
            }
            """,
            broadcaster,
            new TwitchOptions { ChannelLogin = "fallback-login" },
            NullLogger.Instance);

        Assert.False(broadcaster.Current.Twitch.Live);
        Assert.Equal("fallback-login", broadcaster.Current.Twitch.Channel);
        Assert.False(broadcaster.Current.IsLive);
        Assert.Null(broadcaster.Current.PrimarySource);
    }

    private static string ComputeTwitchSignature(string secret, string messageId, string timestamp, byte[] body)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        hmac.TransformBlock(Encoding.UTF8.GetBytes(messageId), 0, messageId.Length, null, 0);
        var ts = Encoding.UTF8.GetBytes(timestamp);
        hmac.TransformBlock(ts, 0, ts.Length, null, 0);
        hmac.TransformFinalBlock(body, 0, body.Length);
        return Convert.ToHexStringLower(hmac.Hash!);
    }
}
