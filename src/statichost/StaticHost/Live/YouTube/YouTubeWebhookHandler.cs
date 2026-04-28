using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;

namespace StaticHost.Live.YouTube;

/// <summary>
/// Pure helpers for the YouTube WebSub (PubSubHubbub) callbacks.
/// Kept separate from the endpoint for unit testability.
/// </summary>
public static class YouTubeWebhookHandler
{
    /// <summary>
    /// Validates the <c>X-Hub-Signature</c> header (e.g.
    /// <c>sha1=...</c>) using the shared secret. Constant-time comparison.
    /// </summary>
    public static bool IsValidSignature(string secret, byte[] body, string signatureHeader)
    {
        if (string.IsNullOrEmpty(signatureHeader)) return false;
        const string prefix = "sha1=";
        if (!signatureHeader.StartsWith(prefix, StringComparison.Ordinal)) return false;
        var expectedHex = signatureHeader[prefix.Length..];

        using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(secret));
        var actual = hmac.ComputeHash(body);
        var actualHex = Convert.ToHexStringLower(actual);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(actualHex),
            Encoding.ASCII.GetBytes(expectedHex));
    }

    /// <summary>
    /// Best-effort extraction of the YouTube video id from an Atom-feed payload.
    /// Returns null when the body isn't a recognisable Atom entry.
    /// </summary>
    public static string? ExtractVideoId(byte[] body)
    {
        try
        {
            using var ms = new MemoryStream(body);
            var doc = XDocument.Load(ms);
            XNamespace yt = "http://www.youtube.com/xml/schemas/2015";
            var videoId = doc.Descendants(yt + "videoId").FirstOrDefault()?.Value;
            return string.IsNullOrEmpty(videoId) ? null : videoId;
        }
        catch
        {
            return null;
        }
    }
}
