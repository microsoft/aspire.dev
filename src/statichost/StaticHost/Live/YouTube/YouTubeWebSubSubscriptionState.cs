using System.Security.Cryptography;
using System.Text;

namespace StaticHost.Live.YouTube;

/// <summary>
/// Coordinates asynchronous WebSub subscription requests with verification
/// callbacks and schedules renewal from the lease granted by the hub.
/// </summary>
public interface IYouTubeWebSubSubscriptionState
{
    ValueTask<YouTubeWebSubSubscriptionRequest?> TryBeginSubscriptionAsync(
        string channelId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default);

    ValueTask MarkRequestFailedAsync(
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

/// <summary>Single-process subscription state used by focused unit tests.</summary>
public sealed class YouTubeWebSubSubscriptionState : IYouTubeWebSubSubscriptionState
{
    private readonly Lock _gate = new();
    private YouTubeWebSubSubscriptionData _state = YouTubeWebSubSubscriptionData.Empty;

    public ValueTask<YouTubeWebSubSubscriptionRequest?> TryBeginSubscriptionAsync(
        string channelId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            var request = YouTubeWebSubSubscriptionTransitions.TryBegin(_state, channelId, now, out _state);
            return ValueTask.FromResult(request);
        }
    }

    public ValueTask MarkRequestFailedAsync(
        YouTubeWebSubSubscriptionRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            _state = YouTubeWebSubSubscriptionTransitions.MarkRequestFailed(_state, request);
        }

        return ValueTask.CompletedTask;
    }

    public ValueTask MarkRequestSentAsync(
        YouTubeWebSubSubscriptionRequest request,
        DateTimeOffset sentAt,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            _state = YouTubeWebSubSubscriptionTransitions.MarkRequestSent(
                _state,
                request,
                sentAt);
        }

        return ValueTask.CompletedTask;
    }

    public ValueTask<bool> TryConfirmSubscriptionAsync(
        string mode,
        string topic,
        string verifyToken,
        int leaseSeconds,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            var confirmed = YouTubeWebSubSubscriptionTransitions.TryConfirm(
                _state,
                mode,
                topic,
                verifyToken,
                leaseSeconds,
                now,
                out _state);

            return ValueTask.FromResult(confirmed);
        }
    }

    public ValueTask<DateTimeOffset> GetRenewAtAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            return ValueTask.FromResult(_state.RenewAt);
        }
    }
}

public sealed record YouTubeWebSubSubscriptionRequest(
    string Topic,
    string VerifyToken,
    DateTimeOffset RequestedAt,
    DateTimeOffset? SentAt = null);

internal sealed record YouTubeWebSubSubscriptionData(
    YouTubeWebSubSubscriptionRequest? Pending,
    string? ActiveTopic,
    DateTimeOffset RenewAt)
{
    public static YouTubeWebSubSubscriptionData Empty { get; } = new(
        Pending: null,
        ActiveTopic: null,
        RenewAt: DateTimeOffset.MinValue);
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

        next = current with { Pending = request };
        return request;
    }

    public static YouTubeWebSubSubscriptionData MarkRequestFailed(
        YouTubeWebSubSubscriptionData current,
        YouTubeWebSubSubscriptionRequest request) =>
        RequestsMatch(current.Pending, request) ? current with { Pending = null } : current;

    public static YouTubeWebSubSubscriptionData MarkRequestSent(
        YouTubeWebSubSubscriptionData current,
        YouTubeWebSubSubscriptionRequest request,
        DateTimeOffset sentAt) =>
        RequestsMatch(current.Pending, request)
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
        if (!HasValidConfirmationShape(mode, topic, verifyToken, leaseSeconds) ||
            current.Pending is null ||
            now - (current.Pending.SentAt ?? current.Pending.RequestedAt) >= s_verificationTimeout ||
            !string.Equals(current.Pending.Topic, topic, StringComparison.Ordinal) ||
            !TokensEqual(current.Pending.VerifyToken, verifyToken))
        {
            next = current;
            return false;
        }

        next = new YouTubeWebSubSubscriptionData(
            Pending: null,
            ActiveTopic: topic,
            RenewAt: now.AddSeconds(leaseSeconds * 0.8));
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

    private static string TopicFor(string channelId) =>
        $"https://www.youtube.com/xml/feeds/videos.xml?channel_id={channelId}";

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
