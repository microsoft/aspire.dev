using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace StaticHost.Live.Twitch;

/// <summary>
/// Pure functions that translate a Twitch EventSub callback into a state update.
/// Kept separate from the endpoint so it can be unit-tested without HTTP.
/// </summary>
public static class TwitchWebhookHandler
{
    /// <summary>
    /// Validates the <c>Twitch-Eventsub-Message-Signature</c> header against the
    /// HMAC-SHA256 of <c>messageId + timestamp + body</c> using the shared secret.
    /// Constant-time comparison.
    /// </summary>
    public static bool IsValidSignature(string secret, string messageId, string timestamp, byte[] body, string signatureHeader)
    {
        if (string.IsNullOrEmpty(signatureHeader)) return false;
        const string prefix = "sha256=";
        if (!signatureHeader.StartsWith(prefix, StringComparison.Ordinal)) return false;
        var expectedHex = signatureHeader[prefix.Length..];

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        hmac.TransformBlock(Encoding.UTF8.GetBytes(messageId), 0, messageId.Length, null, 0);
        var tsBytes = Encoding.UTF8.GetBytes(timestamp);
        hmac.TransformBlock(tsBytes, 0, tsBytes.Length, null, 0);
        hmac.TransformFinalBlock(body, 0, body.Length);
        var actualHex = Convert.ToHexStringLower(hmac.Hash!);

        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(actualHex),
            Encoding.ASCII.GetBytes(expectedHex));
    }

    /// <summary>
    /// Branches on <c>Twitch-Eventsub-Message-Type</c>:
    /// <list type="bullet">
    ///   <item><c>webhook_callback_verification</c> → return raw <c>challenge</c>.</item>
    ///   <item><c>notification</c> → dispatch a state update.</item>
    ///   <item><c>revocation</c> → log + 204; reconcile loop will recreate the sub.</item>
    /// </list>
    /// </summary>
    public static IResult Handle(string messageType, string bodyJson, LiveStatusBroadcaster broadcaster, TwitchOptions twitch, ILogger logger)
    {
        switch (messageType)
        {
            case "webhook_callback_verification":
                {
                    using var doc = JsonDocument.Parse(bodyJson);
                    var challenge = doc.RootElement.GetProperty("challenge").GetString() ?? "";
                    return Results.Text(challenge, "text/plain");
                }
            case "notification":
                {
                    using var doc = JsonDocument.Parse(bodyJson);
                    var subType = doc.RootElement.GetProperty("subscription").GetProperty("type").GetString();
                    var ev = doc.RootElement.GetProperty("event");
                    var login = ev.TryGetProperty("broadcaster_user_login", out var loginEl) ? loginEl.GetString() : twitch.ChannelLogin;
                    switch (subType)
                    {
                        case "stream.online":
                            broadcaster.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, login, null) });
                            logger.LogInformation("Twitch stream.online for {Login}", login);
                            break;
                        case "stream.offline":
                            broadcaster.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(false, login, null) });
                            logger.LogInformation("Twitch stream.offline for {Login}", login);
                            break;
                        default:
                            logger.LogDebug("Twitch notification of unhandled type {Type}", subType);
                            break;
                    }
                    return Results.Ok();
                }
            case "revocation":
                logger.LogWarning("Twitch EventSub subscription revoked: {Body}", bodyJson);
                return Results.NoContent();
            default:
                logger.LogDebug("Twitch webhook of unknown message-type {Type}", messageType);
                return Results.Ok();
        }
    }
}
