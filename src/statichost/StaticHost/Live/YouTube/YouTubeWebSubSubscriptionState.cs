using System.Security.Cryptography;
using System.Text;

namespace StaticHost.Live.YouTube;

/// <summary>
/// Coordinates asynchronous WebSub subscription requests with verification
/// callbacks and schedules renewal from the lease granted by the hub.
/// </summary>
public sealed class YouTubeWebSubSubscriptionState
{
    private static readonly TimeSpan s_verificationTimeout = TimeSpan.FromMinutes(10);
    private readonly object _gate = new();

    private YouTubeWebSubSubscriptionRequest? _pending;
    private string? _activeTopic;
    private DateTimeOffset _renewAt = DateTimeOffset.MinValue;

    internal bool ShouldRequestSubscription(string channelId, DateTimeOffset now)
    {
        var topic = TopicFor(channelId);
        lock (_gate)
        {
            if (_pending is not null)
            {
                if (string.Equals(_pending.Topic, topic, StringComparison.Ordinal) &&
                    now - _pending.RequestedAt < s_verificationTimeout)
                {
                    return false;
                }

                _pending = null;
            }

            return !string.Equals(_activeTopic, topic, StringComparison.Ordinal) || now >= _renewAt;
        }
    }

    internal YouTubeWebSubSubscriptionRequest BeginSubscription(string channelId, DateTimeOffset now)
    {
        var request = new YouTubeWebSubSubscriptionRequest(
            TopicFor(channelId),
            Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32)),
            now);

        lock (_gate)
        {
            _pending = request;
        }

        return request;
    }

    internal void MarkRequestFailed(YouTubeWebSubSubscriptionRequest request)
    {
        lock (_gate)
        {
            if (_pending == request)
            {
                _pending = null;
            }
        }
    }

    internal bool TryConfirmSubscription(
        string mode,
        string topic,
        string verifyToken,
        int leaseSeconds,
        DateTimeOffset now)
    {
        if (!string.Equals(mode, "subscribe", StringComparison.Ordinal) || leaseSeconds <= 0)
        {
            return false;
        }

        lock (_gate)
        {
            if (_pending is null ||
                now - _pending.RequestedAt >= s_verificationTimeout ||
                !string.Equals(_pending.Topic, topic, StringComparison.Ordinal) ||
                !TokensEqual(_pending.VerifyToken, verifyToken))
            {
                return false;
            }

            _activeTopic = topic;
            _renewAt = now.AddSeconds(leaseSeconds * 0.8);
            _pending = null;
            return true;
        }
    }

    internal DateTimeOffset RenewAt
    {
        get
        {
            lock (_gate)
            {
                return _renewAt;
            }
        }
    }

    private static string TopicFor(string channelId) =>
        $"https://www.youtube.com/xml/feeds/videos.xml?channel_id={channelId}";

    private static bool TokensEqual(string expected, string actual)
    {
        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var actualBytes = Encoding.UTF8.GetBytes(actual);
        return expectedBytes.Length == actualBytes.Length &&
            CryptographicOperations.FixedTimeEquals(expectedBytes, actualBytes);
    }
}

internal sealed record YouTubeWebSubSubscriptionRequest(
    string Topic,
    string VerifyToken,
    DateTimeOffset RequestedAt);
