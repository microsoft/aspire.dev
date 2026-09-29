using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

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
        var messageIdBytes = Encoding.UTF8.GetBytes(messageId);
        hmac.TransformBlock(messageIdBytes, 0, messageIdBytes.Length, null, 0);
        var tsBytes = Encoding.UTF8.GetBytes(timestamp);
        hmac.TransformBlock(tsBytes, 0, tsBytes.Length, null, 0);
        hmac.TransformFinalBlock(body, 0, body.Length);
        var actualHex = Convert.ToHexStringLower(hmac.Hash!);

        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(actualHex),
            Encoding.ASCII.GetBytes(expectedHex));
    }

    /// <summary>
    /// Returns <see langword="true"/> when <paramref name="timestamp"/> (the
    /// <c>Twitch-Eventsub-Message-Timestamp</c> header, RFC3339) is no older than
    /// <paramref name="maxAge"/> relative to <paramref name="now"/>. A minute of
    /// future clock skew is tolerated; an unparseable timestamp is treated as not
    /// fresh. Combined with message-id dedup this bounds how long a captured — but
    /// genuinely signed — notification can be replayed.
    /// </summary>
    public static bool IsFresh(string timestamp, DateTimeOffset now, TimeSpan maxAge)
    {
        if (!DateTimeOffset.TryParse(timestamp, CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind, out var sent))
        {
            return false;
        }

        var age = now - sent;
        return age <= maxAge && age >= TimeSpan.FromMinutes(-1);
    }

    internal static string SanitizeDiagnosticValue(string value)
    {
        const int maxLength = 128;
        var bounded = value.Length > maxLength ? value[..(maxLength - 3)] + "..." : value;
        return Regex.Replace(bounded, "[^a-zA-Z0-9_.:+-]", "_");
    }

    private static void LogRevocation(string bodyJson, ILogger logger)
    {
        try
        {
            using var document = JsonDocument.Parse(bodyJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object ||
                !document.RootElement.TryGetProperty("subscription", out var subscription) ||
                subscription.ValueKind != JsonValueKind.Object)
            {
                logger.LogWarning("Twitch EventSub subscription revoked; subscription details unavailable.");
                return;
            }

            // Retain the subscription state, not transport URLs or other payload data.
            logger.LogWarning(
                "Twitch EventSub subscription revoked (Id: {SubscriptionId}, Type: {SubscriptionType}, Status: {SubscriptionStatus}).",
                LogField("id"), LogField("type"), LogField("status"));

            string LogField(string name) =>
                subscription.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
                    ? SanitizeDiagnosticValue(value.GetString()!)
                    : "<missing>";
        }
        catch (JsonException)
        {
            logger.LogWarning("Twitch EventSub subscription revoked; payload is not valid JSON.");
        }
    }

    /// <summary>
    /// Branches on <c>Twitch-Eventsub-Message-Type</c>:
    /// <list type="bullet">
    ///   <item><c>webhook_callback_verification</c> → return raw <c>challenge</c>.</item>
    ///   <item><c>notification</c> → dispatch a state update.</item>
    ///   <item><c>revocation</c> → log + 204; reconcile loop will recreate the sub.</item>
    /// </list>
    /// </summary>
    public static IResult Handle(
        string messageType,
        string bodyJson,
        LiveStatusBroadcaster broadcaster,
        TwitchOptions twitch,
        ILogger logger) =>
        HandleAsync(
            messageType,
            bodyJson,
            broadcaster,
            twitch,
            logger).GetAwaiter().GetResult();

    /// <summary>Asynchronously handles a Twitch EventSub callback.</summary>
    public static async Task<IResult> HandleAsync(
        string messageType,
        string bodyJson,
        LiveStatusBroadcaster broadcaster,
        TwitchOptions twitch,
        ILogger logger,
        CancellationToken cancellationToken = default)
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
                            await broadcaster.UpdateAsync(
                                new LiveStatusUpdate { Twitch = new TwitchStatus(true, login, null) },
                                cancellationToken).ConfigureAwait(false);
                            logger.LogInformation("Twitch stream.online for {Login}", login);
                            break;
                        case "stream.offline":
                            await broadcaster.UpdateAsync(
                                new LiveStatusUpdate { Twitch = new TwitchStatus(false, login, null) },
                                cancellationToken).ConfigureAwait(false);
                            logger.LogInformation("Twitch stream.offline for {Login}", login);
                            break;
                        default:
                            logger.LogDebug("Twitch notification of unhandled type {Type}", subType);
                            break;
                    }
                    return Results.Ok();
                }
            case "revocation":
                LogRevocation(bodyJson, logger);
                return Results.NoContent();
            default:
                logger.LogDebug("Twitch webhook of unknown message type {MessageType} (sanitized).",
                    SanitizeDiagnosticValue(messageType));
                return Results.Ok();
        }
    }
}
