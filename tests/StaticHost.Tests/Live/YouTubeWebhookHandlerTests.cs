using System.Security.Cryptography;
using System.Text;
using StaticHost.Live.YouTube;
using Xunit;

namespace StaticHost.Tests.Live;

public class YouTubeWebhookHandlerTests
{
    private const string Secret = "yt-secret-xyz";

    [Fact]
    public void IsValidSignature_round_trips()
    {
        var body = Encoding.UTF8.GetBytes("hello youtube");
        var sig = ComputeSha1(Secret, body);
        Assert.True(YouTubeWebhookHandler.IsValidSignature(Secret, body, $"sha1={sig}"));
    }

    [Fact]
    public void IsValidSignature_rejects_modified_body()
    {
        var body = Encoding.UTF8.GetBytes("hello youtube");
        var sig = ComputeSha1(Secret, body);
        var tampered = Encoding.UTF8.GetBytes("hello YouTube");
        Assert.False(YouTubeWebhookHandler.IsValidSignature(Secret, tampered, $"sha1={sig}"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("sha256=abc")]
    [InlineData("garbage")]
    public void IsValidSignature_rejects_unsupported_or_empty_headers(string header)
    {
        Assert.False(YouTubeWebhookHandler.IsValidSignature(Secret, [1, 2, 3], header));
    }

    [Fact]
    public void ExtractVideoId_returns_id_from_atom_payload()
    {
        var body = Encoding.UTF8.GetBytes("""
            <?xml version="1.0" encoding="UTF-8"?>
            <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
              <entry>
                <yt:videoId>dQw4w9WgXcQ</yt:videoId>
              </entry>
            </feed>
            """);
        Assert.Equal("dQw4w9WgXcQ", YouTubeWebhookHandler.ExtractVideoId(body));
    }

    [Fact]
    public void ExtractVideoId_returns_null_for_non_atom_payload()
    {
        Assert.Null(YouTubeWebhookHandler.ExtractVideoId(Encoding.UTF8.GetBytes("not xml at all")));
    }

    [Fact]
    public void ExtractVideoId_returns_null_when_videoId_missing()
    {
        var body = Encoding.UTF8.GetBytes("""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry/></feed>""");
        Assert.Null(YouTubeWebhookHandler.ExtractVideoId(body));
    }

    private static string ComputeSha1(string secret, byte[] body)
    {
        using var h = new HMACSHA1(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexStringLower(h.ComputeHash(body));
    }
}
