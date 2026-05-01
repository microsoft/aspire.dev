using System.Security.Cryptography;
using System.Text;
using StaticHost.Live.Twitch;
using Xunit;

namespace StaticHost.Tests.Live;

public class TwitchWebhookHandlerTests
{
    private const string Secret = "topsecret-123";

    [Fact]
    public void IsValidSignature_returns_true_for_correctly_computed_signature()
    {
        var messageId = "msg-1";
        var timestamp = "2026-04-27T20:00:00Z";
        var body = Encoding.UTF8.GetBytes("""{"subscription":{"type":"stream.online"}}""");

        var sig = ComputeTwitchSignature(Secret, messageId, timestamp, body);

        Assert.True(TwitchWebhookHandler.IsValidSignature(Secret, messageId, timestamp, body, $"sha256={sig}"));
    }

    [Fact]
    public void IsValidSignature_returns_false_for_tampered_body()
    {
        var messageId = "msg-1";
        var timestamp = "2026-04-27T20:00:00Z";
        var body = Encoding.UTF8.GetBytes("""{"subscription":{"type":"stream.online"}}""");
        var sig = ComputeTwitchSignature(Secret, messageId, timestamp, body);

        var tampered = Encoding.UTF8.GetBytes("""{"subscription":{"type":"stream.offline"}}""");
        Assert.False(TwitchWebhookHandler.IsValidSignature(Secret, messageId, timestamp, tampered, $"sha256={sig}"));
    }

    [Fact]
    public void IsValidSignature_returns_false_for_wrong_secret()
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
    public void IsValidSignature_rejects_malformed_headers(string header)
    {
        var body = Array.Empty<byte>();
        Assert.False(TwitchWebhookHandler.IsValidSignature(Secret, "m", "t", body, header));
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
