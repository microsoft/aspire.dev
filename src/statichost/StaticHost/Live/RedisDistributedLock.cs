using StackExchange.Redis;

namespace StaticHost.Live;

internal sealed class RedisDistributedLock(
    IConnectionMultiplexer connectionMultiplexer,
    TimeProvider timeProvider,
    ILogger<RedisDistributedLock> logger)
{
    private static readonly TimeSpan s_lockLifetime = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan s_acquireTimeout = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan s_retryDelay = TimeSpan.FromMilliseconds(50);

    public async Task<T> ExecuteAsync<T>(
        string key,
        Func<RedisDistributedLockLease, CancellationToken, Task<T>> action,
        CancellationToken cancellationToken)
    {
        var database = connectionMultiplexer.GetDatabase();
        var ownerToken = Guid.NewGuid().ToString("N");
        var deadline = timeProvider.GetUtcNow() + s_acquireTimeout;

        while (!await database.LockTakeAsync(key, ownerToken, s_lockLifetime).ConfigureAwait(false))
        {
            if (timeProvider.GetUtcNow() >= deadline)
            {
                throw new TimeoutException($"Timed out acquiring the distributed lock '{key}'.");
            }

            await Task.Delay(s_retryDelay, timeProvider, cancellationToken).ConfigureAwait(false);
        }

        try
        {
            return await action(
                new RedisDistributedLockLease(database, key, ownerToken),
                cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            try
            {
                if (!await database.LockReleaseAsync(key, ownerToken).ConfigureAwait(false))
                {
                    logger.LogWarning(
                        "Distributed lock {LockKey} expired before it could be released.",
                        key);
                }
            }
            catch (RedisException exception)
            {
                logger.LogWarning(
                    exception,
                    "Could not release distributed lock {LockKey}.",
                    key);
            }
        }
    }
}

internal sealed class RedisDistributedLockLease(
    IDatabase database,
    RedisKey lockKey,
    RedisValue ownerToken)
{
    private const string SetIfOwnedScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then " +
        "redis.call('hset', KEYS[2], " +
        "'absexp', '-1', 'sldexp', '-1', 'data', ARGV[2]); " +
        "redis.call('persist', KEYS[2]); return 1 else return 0 end";

    public async Task SetCacheValueAsync(RedisKey key, RedisValue value)
    {
        var result = await database.ScriptEvaluateAsync(
            SetIfOwnedScript,
            [lockKey, key],
            [ownerToken, value]).ConfigureAwait(false);

        if ((long)result == 0)
        {
            throw new InvalidOperationException(
                $"Distributed lock '{lockKey}' expired before the protected write completed.");
        }
    }
}
