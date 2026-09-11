using System.Security.Cryptography;
using System.Text;
using StackExchange.Redis;

namespace StaticHost.Live;

/// <summary>Coordinates cross-worker replay, queuing, and provider leadership.</summary>
public interface ILiveStatusCoordination
{
    ValueTask<TwitchMessageAcquisition> AcquireTwitchMessageAsync(
        string messageId,
        CancellationToken cancellationToken = default);

    ValueTask<bool> TryQueueYouTubeConfirmationAsync(
        CancellationToken cancellationToken = default);

    Task RunAsLeaderAsync(
        string leaseKey,
        Func<CancellationToken, Task> action,
        CancellationToken cancellationToken);
}

public enum TwitchMessageAcquisitionStatus
{
    Acquired,
    Processing,
    Completed,
}

public readonly record struct TwitchMessageAcquisition(
    TwitchMessageAcquisitionStatus Status,
    ITwitchMessageLease? Lease = null);

/// <summary>
/// Keeps a Twitch message ID reserved while its state update is in progress.
/// Complete the lease only after the update succeeds; otherwise disposal makes
/// the message eligible for a provider retry.
/// </summary>
public interface ITwitchMessageLease : IAsyncDisposable
{
    ValueTask CompleteAsync();
}

internal sealed class RedisLiveStatusCoordination(
    IConnectionMultiplexer connectionMultiplexer,
    TimeProvider timeProvider,
    ILogger<RedisLiveStatusCoordination> logger) : ILiveStatusCoordination
{
    private const string CompletedMessage = "completed";

    private static readonly TimeSpan s_twitchProcessingLifetime = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan s_twitchReplayLifetime = TimeSpan.FromMinutes(11);
    private static readonly TimeSpan s_confirmationLifetime = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan s_leaderLeaseLifetime = TimeSpan.FromSeconds(45);
    private static readonly TimeSpan s_leaderRenewalInterval = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan s_leaderRetryInterval = TimeSpan.FromSeconds(5);

    private const string RenewLeaseScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then " +
        "return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

    private const string ReleaseLeaseScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then " +
        "return redis.call('del', KEYS[1]) else return 0 end";

    private const string CompleteTwitchMessageScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then " +
        "redis.call('set', KEYS[1], ARGV[2], 'PX', ARGV[3]); return 1 else return 0 end";

    public async ValueTask<TwitchMessageAcquisition> AcquireTwitchMessageAsync(
        string messageId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var messageHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(messageId)));

        var key = LiveStatusRedisKeys.TwitchMessagePrefix + messageHash;
        var ownerToken = Guid.NewGuid().ToString("N");
        var database = connectionMultiplexer.GetDatabase();

        while (true)
        {
            if (await database.StringSetAsync(
                key,
                ownerToken,
                s_twitchProcessingLifetime,
                When.NotExists).ConfigureAwait(false))
            {
                return new TwitchMessageAcquisition(
                    TwitchMessageAcquisitionStatus.Acquired,
                    new RedisTwitchMessageLease(
                        database,
                        key,
                        ownerToken,
                        logger));
            }

            var existing = await database.StringGetAsync(key).ConfigureAwait(false);
            if (existing.IsNull)
            {
                continue;
            }

            return new TwitchMessageAcquisition(
                existing == CompletedMessage
                    ? TwitchMessageAcquisitionStatus.Completed
                    : TwitchMessageAcquisitionStatus.Processing);
        }
    }

    public async ValueTask<bool> TryQueueYouTubeConfirmationAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return await connectionMultiplexer.GetDatabase().StringSetAsync(
            LiveStatusRedisKeys.YouTubeConfirmation,
            RedisValue.EmptyString,
            s_confirmationLifetime,
            When.NotExists).ConfigureAwait(false);
    }

    public async Task RunAsLeaderAsync(
        string leaseKey,
        Func<CancellationToken, Task> action,
        CancellationToken cancellationToken)
    {
        var database = connectionMultiplexer.GetDatabase();
        var ownerToken = Guid.NewGuid().ToString("N");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (!await database.StringSetAsync(
                        leaseKey,
                        ownerToken,
                        s_leaderLeaseLifetime,
                        When.NotExists).ConfigureAwait(false))
                {
                    await Task.Delay(
                        s_leaderRetryInterval,
                        timeProvider,
                        cancellationToken).ConfigureAwait(false);
                    continue;
                }
            }
            catch (RedisException exception)
            {
                logger.LogWarning(
                    exception,
                    "Could not acquire provider leadership lease {LeaseKey}.",
                    leaseKey);

                await Task.Delay(
                    s_leaderRetryInterval,
                    timeProvider,
                    cancellationToken).ConfigureAwait(false);
                continue;
            }

            using var leadershipCancellation = CancellationTokenSource.CreateLinkedTokenSource(
                cancellationToken);
            var actionTask = action(leadershipCancellation.Token);
            var leadershipLost = false;

            try
            {
                while (!actionTask.IsCompleted)
                {
                    await Task.Delay(
                        s_leaderRenewalInterval,
                        timeProvider,
                        cancellationToken).ConfigureAwait(false);

                    if (!await RenewLeaseAsync(database, leaseKey, ownerToken).ConfigureAwait(false))
                    {
                        leadershipLost = true;
                        logger.LogWarning(
                            "Lost provider leadership lease {LeaseKey}; stopping the leader loop.",
                            leaseKey);
                        leadershipCancellation.Cancel();
                        break;
                    }
                }

                try
                {
                    await actionTask.ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (
                    leadershipLost && !cancellationToken.IsCancellationRequested)
                {
                }
            }
            finally
            {
                leadershipCancellation.Cancel();
                try
                {
                    if (!actionTask.IsCompleted)
                    {
                        await actionTask.ConfigureAwait(false);
                    }
                }
                catch (OperationCanceledException) when (leadershipCancellation.IsCancellationRequested)
                {
                }
                finally
                {
                    await ReleaseLeaseAsync(database, leaseKey, ownerToken).ConfigureAwait(false);
                }
            }

            if (!leadershipLost)
            {
                return;
            }
        }
    }

    private async Task<bool> RenewLeaseAsync(
        IDatabase database,
        RedisKey leaseKey,
        RedisValue ownerToken)
    {
        try
        {
            var result = await database.ScriptEvaluateAsync(
                RenewLeaseScript,
                [leaseKey],
                [ownerToken, (long)s_leaderLeaseLifetime.TotalMilliseconds]).ConfigureAwait(false);

            return (long)result != 0;
        }
        catch (RedisException exception)
        {
            logger.LogWarning(
                exception,
                "Could not renew provider leadership lease {LeaseKey}.",
                leaseKey);
            return false;
        }
    }

    private async Task ReleaseLeaseAsync(
        IDatabase database,
        RedisKey leaseKey,
        RedisValue ownerToken)
    {
        try
        {
            await database.ScriptEvaluateAsync(
                ReleaseLeaseScript,
                [leaseKey],
                [ownerToken]).ConfigureAwait(false);
        }
        catch (RedisException exception)
        {
            logger.LogWarning(
                exception,
                "Could not release provider leadership lease {LeaseKey}.",
                leaseKey);
        }
    }

    private sealed class RedisTwitchMessageLease(
        IDatabase database,
        RedisKey key,
        RedisValue ownerToken,
        ILogger logger) : ITwitchMessageLease
    {
        private bool _completed;

        public async ValueTask CompleteAsync()
        {
            var result = await database.ScriptEvaluateAsync(
                CompleteTwitchMessageScript,
                [key],
                [ownerToken, CompletedMessage, (long)s_twitchReplayLifetime.TotalMilliseconds])
                .ConfigureAwait(false);

            if ((long)result == 0)
            {
                throw new InvalidOperationException(
                    $"Twitch message lease '{key}' expired before processing completed.");
            }

            _completed = true;
        }

        public async ValueTask DisposeAsync()
        {
            if (_completed)
            {
                return;
            }

            try
            {
                await database.ScriptEvaluateAsync(
                    ReleaseLeaseScript,
                    [key],
                    [ownerToken]).ConfigureAwait(false);
            }
            catch (RedisException exception)
            {
                logger.LogWarning(
                    exception,
                    "Could not release failed Twitch message lease {MessageKey}.",
                    key);
            }
        }
    }
}
