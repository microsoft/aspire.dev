using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace StaticHost.Live.YouTube;

internal sealed class RedisYouTubeWebSubSubscriptionState(
    IDistributedCache cache,
    RedisDistributedLock distributedLock) : IYouTubeWebSubSubscriptionState
{
    public ValueTask<YouTubeWebSubSubscriptionRequest?> TryBeginSubscriptionAsync(
        string channelId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default) =>
        new(distributedLock.ExecuteAsync(
            LiveStatusRedisKeys.YouTubeSubscriptionLock,
            async (lockLease, lockCancellationToken) =>
            {
                var current = await GetAsync(lockCancellationToken).ConfigureAwait(false);
                var request = YouTubeWebSubSubscriptionTransitions.TryBegin(
                    current,
                    channelId,
                    now,
                    out var next);

                if (next != current)
                {
                    await SetAsync(next, lockLease).ConfigureAwait(false);
                }

                return request;
            },
            cancellationToken));

    public ValueTask MarkRequestFailedAsync(
        YouTubeWebSubSubscriptionRequest request,
        CancellationToken cancellationToken = default) =>
        new(distributedLock.ExecuteAsync(
            LiveStatusRedisKeys.YouTubeSubscriptionLock,
            async (lockLease, lockCancellationToken) =>
            {
                var current = await GetAsync(lockCancellationToken).ConfigureAwait(false);
                var next = YouTubeWebSubSubscriptionTransitions.MarkRequestFailed(current, request);

                if (next != current)
                {
                    await SetAsync(next, lockLease).ConfigureAwait(false);
                }

                return true;
            },
            cancellationToken));

    public ValueTask MarkRequestSentAsync(
        YouTubeWebSubSubscriptionRequest request,
        DateTimeOffset sentAt,
        CancellationToken cancellationToken = default) =>
        new(distributedLock.ExecuteAsync(
            LiveStatusRedisKeys.YouTubeSubscriptionLock,
            async (lockLease, lockCancellationToken) =>
            {
                var current = await GetAsync(lockCancellationToken).ConfigureAwait(false);
                var next = YouTubeWebSubSubscriptionTransitions.MarkRequestSent(
                    current,
                    request,
                    sentAt);

                if (next != current)
                {
                    await SetAsync(next, lockLease).ConfigureAwait(false);
                }

                return true;
            },
            cancellationToken));

    public async ValueTask<bool> TryConfirmSubscriptionAsync(
        string mode,
        string topic,
        string verifyToken,
        int leaseSeconds,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        if (!YouTubeWebSubSubscriptionTransitions.HasValidConfirmationShape(
                mode,
                topic,
                verifyToken,
                leaseSeconds))
        {
            return false;
        }

        var current = await GetAsync(cancellationToken).ConfigureAwait(false);
        if (!YouTubeWebSubSubscriptionTransitions.TryConfirm(
                current,
                mode,
                topic,
                verifyToken,
                leaseSeconds,
                now,
                out _))
        {
            return false;
        }

        return await distributedLock.ExecuteAsync(
            LiveStatusRedisKeys.YouTubeSubscriptionLock,
            async (lockLease, lockCancellationToken) =>
            {
                var lockedCurrent = await GetAsync(lockCancellationToken).ConfigureAwait(false);
                var confirmed = YouTubeWebSubSubscriptionTransitions.TryConfirm(
                    lockedCurrent,
                    mode,
                    topic,
                    verifyToken,
                    leaseSeconds,
                    now,
                    out var next);

                if (confirmed)
                {
                    await SetAsync(next, lockLease).ConfigureAwait(false);
                }

                return confirmed;
            },
            cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<DateTimeOffset> GetRenewAtAsync(
        CancellationToken cancellationToken = default) =>
        (await GetAsync(cancellationToken).ConfigureAwait(false)).RenewAt;

    private async ValueTask<YouTubeWebSubSubscriptionData> GetAsync(
        CancellationToken cancellationToken)
    {
        var payload = await cache.GetAsync(
            LiveStatusRedisKeys.YouTubeSubscription,
            cancellationToken).ConfigureAwait(false);

        return payload is null
            ? YouTubeWebSubSubscriptionData.Empty
            : JsonSerializer.Deserialize(
                payload,
                LiveStatusJsonContext.Default.YouTubeWebSubSubscriptionData)
                ?? throw new InvalidOperationException(
                    "The distributed YouTube WebSub subscription state was empty.");
    }

    private Task SetAsync(
        YouTubeWebSubSubscriptionData state,
        RedisDistributedLockLease lockLease) =>
        lockLease.SetCacheValueAsync(
            LiveStatusRedisKeys.YouTubeSubscription,
            JsonSerializer.SerializeToUtf8Bytes(
                state,
                LiveStatusJsonContext.Default.YouTubeWebSubSubscriptionData));
}
