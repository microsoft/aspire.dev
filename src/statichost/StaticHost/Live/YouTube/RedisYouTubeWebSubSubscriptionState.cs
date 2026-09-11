using System.Text.Json;
using StackExchange.Redis;

namespace StaticHost.Live.YouTube;

internal sealed class RedisYouTubeWebSubSubscriptionState(
    ILiveStatusRedis redis,
    TimeProvider timeProvider,
    ILogger<RedisYouTubeWebSubSubscriptionState> logger)
    : IYouTubeWebSubSubscriptionState
{
    public ValueTask<YouTubeWebSubSubscriptionRequest?> TryBeginSubscriptionAsync(
        string channelId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default) =>
        UpdateAsync(
            current =>
            {
                var request = YouTubeWebSubSubscriptionTransitions.TryBegin(
                    current,
                    channelId,
                    now,
                    out var next);
                return new StateTransition<YouTubeWebSubSubscriptionRequest?>(next, request);
            },
            cancellationToken);

    public async ValueTask MarkRequestFailedAsync(
        YouTubeWebSubSubscriptionRequest request,
        CancellationToken cancellationToken = default)
    {
        _ = await UpdateAsync(
            current => new StateTransition<bool>(
                YouTubeWebSubSubscriptionTransitions.MarkRequestFailed(current, request),
                true),
            cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask MarkRequestSentAsync(
        YouTubeWebSubSubscriptionRequest request,
        DateTimeOffset sentAt,
        CancellationToken cancellationToken = default)
    {
        _ = await UpdateAsync(
            current => new StateTransition<bool>(
                YouTubeWebSubSubscriptionTransitions.MarkRequestSent(
                    current,
                    request,
                    sentAt),
                true),
            cancellationToken).ConfigureAwait(false);
    }

    public ValueTask<bool> TryConfirmSubscriptionAsync(
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
            return ValueTask.FromResult(false);
        }

        return UpdateAsync(
            current =>
            {
                var confirmed = YouTubeWebSubSubscriptionTransitions.TryConfirm(
                    current,
                    mode,
                    topic,
                    verifyToken,
                    leaseSeconds,
                    now,
                    out var next);
                return new StateTransition<bool>(next, confirmed);
            },
            cancellationToken);
    }

    public async ValueTask<DateTimeOffset> GetRenewAtAsync(
        CancellationToken cancellationToken = default)
    {
        var payload = await redis.GetAsync(
            LiveStatusRedisKeys.YouTubeSubscription,
            cancellationToken).ConfigureAwait(false);

        return payload.IsNull
            ? YouTubeWebSubSubscriptionData.Empty.RenewAt
            : Deserialize(payload).Data.RenewAt;
    }

    private async ValueTask<TResult> UpdateAsync<TResult>(
        Func<YouTubeWebSubSubscriptionData, StateTransition<TResult>> transition,
        CancellationToken cancellationToken)
    {
        var payload = await redis.GetAsync(
            LiveStatusRedisKeys.YouTubeSubscription,
            cancellationToken).ConfigureAwait(false);

        for (var attempt = 1; attempt <= RedisOptimisticConcurrency.MaxAttempts; attempt++)
        {
            var current = payload.IsNull
                ? YouTubeWebSubSubscriptionStateRecord.Empty
                : Deserialize(payload);
            var change = transition(current.Data);
            if (change.State == current.Data)
            {
                return change.Result;
            }

            var next = new YouTubeWebSubSubscriptionStateRecord(
                current.Version + 1,
                change.State);
            var nextPayload = Serialize(next);
            var exchange = await redis.CompareExchangeAsync(
                LiveStatusRedisKeys.YouTubeSubscription,
                payload,
                nextPayload,
                cancellationToken).ConfigureAwait(false);

            if (exchange.Succeeded)
            {
                return change.Result;
            }

            logger.LogDebug(
                "YouTube WebSub state compare-and-set conflicted on attempt {Attempt} of {MaxAttempts}.",
                attempt,
                RedisOptimisticConcurrency.MaxAttempts);
            payload = exchange.Current;
            if (attempt < RedisOptimisticConcurrency.MaxAttempts)
            {
                await RedisOptimisticConcurrency.DelayAsync(
                    attempt,
                    timeProvider,
                    cancellationToken).ConfigureAwait(false);
            }
        }

        logger.LogWarning(
            "YouTube WebSub state compare-and-set did not succeed after {MaxAttempts} attempts.",
            RedisOptimisticConcurrency.MaxAttempts);
        throw new LiveStatusConcurrencyException(
            $"Could not update YouTube WebSub state after {RedisOptimisticConcurrency.MaxAttempts} compare-and-set attempts.");
    }

    private static YouTubeWebSubSubscriptionStateRecord Deserialize(RedisValue payload)
    {
        byte[]? bytes = payload;
        return bytes is null
            ? throw new InvalidOperationException(
                "The distributed YouTube WebSub subscription state was empty.")
            : JsonSerializer.Deserialize(
                bytes,
                LiveStatusJsonContext.Default.YouTubeWebSubSubscriptionStateRecord)
                ?? throw new InvalidOperationException(
                    "The distributed YouTube WebSub subscription state was empty.");
    }

    private static byte[] Serialize(YouTubeWebSubSubscriptionStateRecord state) =>
        JsonSerializer.SerializeToUtf8Bytes(
            state,
            LiveStatusJsonContext.Default.YouTubeWebSubSubscriptionStateRecord);

    private readonly record struct StateTransition<TResult>(
        YouTubeWebSubSubscriptionData State,
        TResult Result);
}
