using System.Diagnostics;
using System.Net.Sockets;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Polly.Timeout;

namespace StaticHost.Live.YouTube;

internal static class YouTubeDiagnostics
{
    internal const string ChannelsEndpoint = "www.googleapis.com/youtube/v3/channels";
    internal const string SearchEndpoint = "www.googleapis.com/youtube/v3/search";
    internal const string VideosEndpoint = "www.googleapis.com/youtube/v3/videos";
    internal const string SubscribeEndpoint = "pubsubhubbub.appspot.com/subscribe";
    private const string DetailsKey = "YouTube.ResponseDiagnostics";
    private const string LoggedKey = "YouTube.FailureLogged";
    private const int BodyLimit = 4096;

    private sealed record ResponseDetails(string? Reason, string? Domain, string Detail, bool Truncated)
    {
        public double? RetryAfterSeconds { get; init; }
        public DateTimeOffset? RetryAfterDate { get; init; }
    }

    internal static async Task EnsureSuccessAsync(
        HttpResponseMessage response, CancellationToken cancellationToken, params string[] secrets)
    {
        if (response.IsSuccessStatusCode) return;

        ResponseDetails details;
        try
        {
            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var reader = new StreamReader(stream);
            var buffer = new char[BodyLimit + 1];
            var count = await reader.ReadBlockAsync(buffer.AsMemory(), cancellationToken).ConfigureAwait(false);
            details = DescribeBody(new string(buffer, 0, Math.Min(count, BodyLimit)), count > BodyLimit, secrets);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception)
        {
            // Diagnostic decoding must never replace the original HTTP failure.
            details = new(null, null, "Response body could not be read; body omitted", false);
        }

        var retryAfter = response.Headers.RetryAfter;
        details = details with
        {
            RetryAfterSeconds = retryAfter?.Delta?.TotalSeconds,
            RetryAfterDate = retryAfter?.Date,
        };

        try
        {
            response.EnsureSuccessStatusCode();
        }
        catch (HttpRequestException exception)
        {
            exception.Data[DetailsKey] = details;
            throw;
        }
    }

    private static ResponseDetails DescribeBody(string body, bool truncated, string[] secrets)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty("error", out var error) &&
                error.ValueKind == JsonValueKind.Object &&
                error.TryGetProperty("errors", out var errors) &&
                errors.ValueKind == JsonValueKind.Array && errors.GetArrayLength() > 0 &&
                errors[0].ValueKind == JsonValueKind.Object)
            {
                return new(
                    ReadCode(errors[0], "reason", secrets),
                    ReadCode(errors[0], "domain", secrets),
                    "Google structured error; message omitted", truncated);
            }
        }
        catch (JsonException) { }

        return new(null, null, ClassifyProviderText(body), truncated);
    }

    internal static void LogUntrustedDenial(
        ILogger logger, string reason, bool topicPresent, bool? matchesConfiguredTopic)
    {
        var truncated = reason.Length > BodyLimit;
        logger.LogWarning(
            "YouTube {Operation}: untrusted, unauthenticated denial report; not proof of a hub decision. " +
            "Topic present {TopicPresent}, matches configured topic {MatchesConfiguredTopic}; " +
            "reason present {ReasonPresent}, length {ReasonLength}, detail {ProviderDetail}, truncated {BodyTruncated}. " +
            "Subscription state and live-status polling are unchanged.",
            "WebSubDenialReport", topicPresent, matchesConfiguredTopic, reason.Length > 0, reason.Length,
            ClassifyProviderText(truncated ? reason[..BodyLimit] : reason), truncated);
    }

    private static string ClassifyProviderText(string text)
    {
        // Only fixed classifications leave this boundary, never echoed HTML, URLs,
        // callback values or arbitrary provider messages.
        return text.Contains("temporarily unavailable", StringComparison.OrdinalIgnoreCase)
            ? "Provider reports temporary unavailability"
            : text.Contains("transient error", StringComparison.OrdinalIgnoreCase)
                ? "Provider reports a transient error"
                : text.Contains("invalid topic", StringComparison.OrdinalIgnoreCase)
                    ? "Provider reports an invalid topic"
                    : text.Contains("verification failed", StringComparison.OrdinalIgnoreCase)
                        ? "Provider reports callback verification failure"
                        : "Unrecognized provider response; body omitted";
    }

    private static string? ReadCode(JsonElement error, string name, string[] secrets)
    {
        if (!error.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.String)
            return null;
        var value = property.GetString();
        if (string.IsNullOrEmpty(value) || value.Length > 64 ||
            value.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '.' and not '_' and not '-') ||
            secrets.Any(secret => !string.IsNullOrEmpty(secret) && value.Contains(secret, StringComparison.Ordinal)))
            return null;
        return value;
    }

    internal static void LogFailure(
        ILogger logger, Exception exception, string operation, string endpoint,
        YouTubeWebSubRetryState? retry = null,
        DateTimeOffset? lastSuccessfulDiscoveryAt = null, bool? lastDiscoveryLive = null,
        bool skipIfLogged = false, double? elapsedMs = null)
    {
        if (skipIfLogged && exception.Data[LoggedKey] is true)
        {
            exception.Data.Remove(LoggedKey);
            return;
        }
        exception.Data[LoggedKey] = true;
        var details = exception.Data[DetailsKey] as ResponseDetails;
        var http = exception as HttpRequestException;
        var status = http?.StatusCode is { } code ? (int?)code : null;
        var timeout = exception is OperationCanceledException or TimeoutException or TimeoutRejectedException;
        SocketException? socket = null;
        var inner = exception.InnerException;
        for (var depth = 0; inner is not null && depth < 4; depth++, inner = inner.InnerException)
        {
            socket ??= inner as SocketException;
            timeout |= inner is TimeoutException or TimeoutRejectedException;
        }
        var expected = http is not null || timeout || exception is JsonException;
        var message =
            "YouTube {Operation} failed at {Endpoint} after {ElapsedMs} ms: {FailureType}, HTTP {StatusCode} {StatusReason}; " +
            "provider reason {ProviderReason}, domain {ProviderDomain}, detail {ProviderDetail}, truncated {BodyTruncated}; " +
            "provider Retry-After seconds {RetryAfterSeconds}, date {RetryAfterDate}; " +
            "timeout {IsTimeout}, network {HttpRequestError}, socket {SocketError}, inner failure {InnerFailureType}. " +
            "Last successful discovery {LastSuccessfulDiscoveryAt}, live {LastDiscoveryLive}. Failure is not an offline observation.";
        List<object?> fields =
        [
            operation, endpoint, elapsedMs, exception.GetType().Name, status,
            status is { } number ? ReasonPhrases.GetReasonPhrase(number) : null,
            details?.Reason, details?.Domain, details?.Detail, details?.Truncated,
            details?.RetryAfterSeconds, details?.RetryAfterDate,
            timeout, http?.HttpRequestError, socket?.SocketErrorCode, exception.InnerException?.GetType().Name,
            lastSuccessfulDiscoveryAt, lastDiscoveryLive,
        ];
        if (operation == "WebSubSubscribe")
        {
            message += " Attempt {FailureCount}. Next subscription attempt no earlier than {RetryAt}. " +
                "Live-status polling remains independently scheduled; this does not indicate a successful poll.";
            fields.Add(retry?.FailureCount);
            fields.Add(retry?.RetryAt);
        }
        else if (operation == "BackgroundTick")
        {
            message += " The worker will retry on its normal tick schedule.";
        }
        if (!expected)
        {
            // Render frames independently: exception messages, ToString overrides,
            // source paths and argument values must not enter the log.
            var stack = new StackTrace(exception, fNeedFileInfo: false).ToString();
            message += " Safe stack trace: {SafeStackTrace}";
            fields.Add(stack.Length > 8192 ? stack[..8192] + " [truncated]" : stack);
        }
        logger.Log(expected ? LogLevel.Warning : LogLevel.Error, message, fields.ToArray());
    }
}
