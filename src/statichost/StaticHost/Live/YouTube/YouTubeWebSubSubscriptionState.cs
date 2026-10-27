using System.Security.Cryptography;
using System.Text;

namespace StaticHost.Live.YouTube;

/// <summary>
/// Coordinates asynchronous WebSub subscription requests with verification
/// callbacks and schedules renewal from the lease granted by the hub. Matching
/// verification retries acknowledge the first confirmation without extending its lease.
/// </summary>
public interface IYouTubeWebSubSubscriptionState
{
    ValueTask<YouTubeWebSubSubscriptionRequest?> TryBeginSubscriptionAsync(
        string channelId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default);

    ValueTask<YouTubeWebSubRetryState?> MarkRequestFailedAsync(
        YouTubeWebSubSubscriptionRequest request,
        CancellationToken cancellationToken = default);

    ValueTask MarkRequestSentAsync(
        YouTubeWebSubSubscriptionRequest request,
        DateTimeOffset sentAt,
        CancellationToken cancellationToken = default);

    ValueTask<bool> TryConfirmSubscriptionAsync(
        string mode,
        string topic,
        string verifyToken,
        int leaseSeconds,
        DateTimeOffset now,
        CancellationToken cancellationToken = default);

    ValueTask<DateTimeOffset> GetRenewAtAsync(CancellationToken cancellationToken = default);
}

public sealed record YouTubeWebSubSubscriptionRequest(
    string Topic,
    string VerifyToken,
    DateTimeOffset RequestedAt,
    DateTimeOffset? SentAt = null);

public sealed record YouTubeWebSubRetryState(
    string Topic,
    int FailureCount,
    DateTimeOffset RetryAt);

internal sealed record YouTubeWebSubSubscriptionData(
    YouTubeWebSubSubscriptionRequest? Pending,
    string? ActiveTopic,
    DateTimeOffset RenewAt,
    YouTubeWebSubConfirmation? RecentConfirmation = null)
{
    public YouTubeWebSubRetryState? Retry { get; init; }

    public static YouTubeWebSubSubscriptionData Empty { get; } = new(
        Pending: null,
        ActiveTopic: null,
        RenewAt: DateTimeOffset.MinValue);
}

internal sealed record YouTubeWebSubConfirmation(
    string Topic,
    string VerifyToken,
    DateTimeOffset ConfirmedAt,
    DateTimeOffset RetryUntil);

internal sealed record YouTubeWebSubSubscriptionStateRecord(
    long Version,
    YouTubeWebSubSubscriptionData Data)
{
    public static YouTubeWebSubSubscriptionStateRecord Empty { get; } =
        new(0, YouTubeWebSubSubscriptionData.Empty);
}

internal static class YouTubeWebSubSubscriptionTransitions
{
    private static readonly TimeSpan s_sendReservationTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan s_verificationTimeout = TimeSpan.FromMinutes(10);

    public static YouTubeWebSubSubscriptionRequest? TryBegin(
        YouTubeWebSubSubscriptionData current,
        string channelId,
        DateTimeOffset now,
        out YouTubeWebSubSubscriptionData next)
    {
        var topic = TopicFor(channelId);
        if (current.Retry is { } retry &&
            string.Equals(retry.Topic, topic, StringComparison.Ordinal) &&
            now < retry.RetryAt)
        {
            next = current;
            return null;
        }

        var pending = current.Pending;

        if (pending is not null)
        {
            var pendingSince = pending.SentAt ?? pending.RequestedAt;
            var pendingTimeout = pending.SentAt is null
                ? s_sendReservationTimeout
                : s_verificationTimeout;

            if (string.Equals(pending.Topic, topic, StringComparison.Ordinal) &&
                now - pendingSince < pendingTimeout)
            {
                next = current;
                return null;
            }

            pending = null;
        }

        if (string.Equals(current.ActiveTopic, topic, StringComparison.Ordinal) &&
            now < current.RenewAt)
        {
            next = current with { Pending = pending };
            return null;
        }

        var request = new YouTubeWebSubSubscriptionRequest(
            topic,
            Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32)),
            now);

        next = current with
        {
            Pending = request,
            RecentConfirmation = null,
            Retry = string.Equals(current.Retry?.Topic, topic, StringComparison.Ordinal) ? current.Retry : null,
        };
        return request;
    }

    public static YouTubeWebSubSubscriptionData MarkRequestFailed(
        YouTubeWebSubSubscriptionData current,
        YouTubeWebSubSubscriptionRequest request,
        DateTimeOffset failedAt)
    {
        if (!RequestsMatch(current.Pending, request))
        {
            return current;
        }

        var failures = (int)Math.Min((long)(current.Retry?.FailureCount ?? 0) + 1, int.MaxValue);
        var minutes = failures switch
        {
            1 => 2,
            2 => 5,
            3 => 15,
            4 => 30,
            _ => 60,
        };
        var delay = TimeSpan.FromMinutes(minutes * (0.9 + Random.Shared.NextDouble() * 0.1));
        return current with
        {
            Pending = null,
            Retry = new YouTubeWebSubRetryState(request.Topic, failures, failedAt.Add(delay)),
        };
    }

    public static YouTubeWebSubSubscriptionData MarkRequestSent(
        YouTubeWebSubSubscriptionData current,
        YouTubeWebSubSubscriptionRequest request,
        DateTimeOffset sentAt) =>
        RequestsMatch(current.Pending, request) && current.Pending!.SentAt is null
            ? current with { Pending = current.Pending! with { SentAt = sentAt } }
            : current;

    public static bool TryConfirm(
        YouTubeWebSubSubscriptionData current,
        string mode,
        string topic,
        string verifyToken,
        int leaseSeconds,
        DateTimeOffset now,
        out YouTubeWebSubSubscriptionData next)
    {
        next = current;
        if (!HasValidConfirmationShape(mode, topic, verifyToken, leaseSeconds))
        {
            return false;
        }

        if (current.RecentConfirmation is { } confirmed &&
            current.Pending is null &&
            now >= confirmed.ConfirmedAt &&
            now < confirmed.RetryUntil &&
            string.Equals(confirmed.Topic, topic, StringComparison.Ordinal) &&
            TokensEqual(confirmed.VerifyToken, verifyToken))
        {
            // The hub can lose our response after Redis commits. Retrying must
            // acknowledge the original lease, not grant a fresh renewal window.
            return true;
        }

        if (current.Pending is null ||
            now - (current.Pending.SentAt ?? current.Pending.RequestedAt) >= s_verificationTimeout ||
            now < current.Pending.RequestedAt ||
            !string.Equals(current.Pending.Topic, topic, StringComparison.Ordinal) ||
            !TokensEqual(current.Pending.VerifyToken, verifyToken))
        {
            return false;
        }

        next = new YouTubeWebSubSubscriptionData(
            Pending: null,
            ActiveTopic: topic,
            RenewAt: now.AddSeconds(leaseSeconds * 0.8),
            RecentConfirmation: new YouTubeWebSubConfirmation(
                topic,
                verifyToken,
                now,
                now.AddSeconds(Math.Min(leaseSeconds, s_verificationTimeout.TotalSeconds))));
        return true;
    }

    public static bool HasValidConfirmationShape(
        string mode,
        string topic,
        string verifyToken,
        int leaseSeconds) =>
        string.Equals(mode, "subscribe", StringComparison.Ordinal) &&
        !string.IsNullOrEmpty(topic) &&
        !string.IsNullOrEmpty(verifyToken) &&
        leaseSeconds > 0;

    internal static string TopicFor(string channelId) =>
        $"https://www.youtube.com/feeds/videos.xml?channel_id={channelId}";

    private static bool RequestsMatch(
        YouTubeWebSubSubscriptionRequest? current,
        YouTubeWebSubSubscriptionRequest expected) =>
        current is not null &&
        string.Equals(current.Topic, expected.Topic, StringComparison.Ordinal) &&
        string.Equals(current.VerifyToken, expected.VerifyToken, StringComparison.Ordinal) &&
        current.RequestedAt == expected.RequestedAt;

    private static bool TokensEqual(string expected, string actual)
    {
        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var actualBytes = Encoding.UTF8.GetBytes(actual);
        return expectedBytes.Length == actualBytes.Length &&
            CryptographicOperations.FixedTimeEquals(expectedBytes, actualBytes);
    }
}
