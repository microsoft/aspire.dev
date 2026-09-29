using StackExchange.Redis;

namespace StaticHost.Live;

internal interface ILiveStatusRedis
{
    ValueTask<RedisValue> GetAsync(
        RedisKey key,
        CancellationToken cancellationToken);

    ValueTask<RedisCompareExchangeResult> CompareExchangeAsync(
        RedisKey key,
        RedisValue expected,
        RedisValue value,
        CancellationToken cancellationToken);

    ValueTask PublishAsync(RedisChannel channel, RedisValue value);
}

internal readonly record struct RedisCompareExchangeResult(
    bool Succeeded,
    RedisValue Current);

internal sealed class LiveStatusRedis(IConnectionMultiplexer connectionMultiplexer)
    : ILiveStatusRedis
{
    private const string CompareExchangeScript =
        """
        local current = redis.call('GET', KEYS[1])
        if ARGV[2] == '1' then
          if current then
            return { 0, current }
          end
        elseif not current or current ~= ARGV[1] then
          return { 0, current or false }
        end

        redis.call('SET', KEYS[1], ARGV[3])
        return { 1, ARGV[3] }
        """;

    private readonly IDatabase _database = connectionMultiplexer.GetDatabase();
    private readonly ISubscriber _subscriber = connectionMultiplexer.GetSubscriber();

    public async ValueTask<RedisValue> GetAsync(
        RedisKey key,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return await _database.StringGetAsync(key).ConfigureAwait(false);
    }

    public async ValueTask<RedisCompareExchangeResult> CompareExchangeAsync(
        RedisKey key,
        RedisValue expected,
        RedisValue value,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var result = await _database.ScriptEvaluateAsync(
            CompareExchangeScript,
            [key],
            [
                expected.IsNull ? RedisValue.EmptyString : expected,
                expected.IsNull ? "1" : "0",
                value,
            ]).ConfigureAwait(false);

        var parts = (RedisResult[]?)result;
        if (parts is not { Length: 2 })
        {
            throw new InvalidOperationException(
                $"Redis returned an invalid compare-and-set result for '{key}'.");
        }

        return new RedisCompareExchangeResult(
            (long)parts[0] == 1,
            (RedisValue)parts[1]);
    }

    public async ValueTask PublishAsync(RedisChannel channel, RedisValue value) =>
        _ = await _subscriber.PublishAsync(channel, value).ConfigureAwait(false);
}

internal static class RedisOptimisticConcurrency
{
    public const int MaxAttempts = 8;

    private const int BaseRetryDelayMs = 5;
    private const int MaxRetryDelayMs = 80;

    public static Task DelayAsync(
        int attempt,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var exponentialDelay = Math.Min(
            BaseRetryDelayMs << Math.Min(attempt - 1, 4),
            MaxRetryDelayMs);
        var delay = TimeSpan.FromMilliseconds(
            exponentialDelay + Random.Shared.Next(0, BaseRetryDelayMs));
        return Task.Delay(delay, timeProvider, cancellationToken);
    }
}

internal sealed class LiveStatusConcurrencyException(string message)
    : InvalidOperationException(message);
