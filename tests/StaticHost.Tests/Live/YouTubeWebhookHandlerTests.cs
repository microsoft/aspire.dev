namespace StaticHost.Tests.Live;

public sealed class YouTubeWebhookHandlerTests
{
    private const string Secret = "yt-secret-xyz";

    [Fact]
    public void IsValidSignature_RoundTrips()
    {
        var body = Encoding.UTF8.GetBytes("hello youtube");
        var sig = ComputeSha1(Secret, body);
        Assert.True(YouTubeWebhookHandler.IsValidSignature(Secret, body, $"sha1={sig}"));
    }

    [Fact]
    public void IsValidSignature_RejectsModifiedBody()
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
    public void IsValidSignature_RejectsUnsupportedOrEmptyHeaders(string header)
    {
        Assert.False(YouTubeWebhookHandler.IsValidSignature(Secret, [1, 2, 3], header));
    }

    [Fact]
    public void ExtractVideoId_ReturnsIdFromAtomPayload()
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
    public void ExtractVideoId_ReturnsNullForNonAtomPayload()
    {
        Assert.Null(YouTubeWebhookHandler.ExtractVideoId(Encoding.UTF8.GetBytes("not xml at all")));
    }

    [Fact]
    public void ExtractVideoId_ReturnsNullWhenVideoIdMissing()
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
