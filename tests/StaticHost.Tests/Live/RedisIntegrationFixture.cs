using System.Diagnostics;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using StackExchange.Redis;

namespace StaticHost.Tests.Live;

[CollectionDefinition(RedisIntegrationCollection.Name, DisableParallelization = true)]
public sealed class RedisIntegrationCollection : ICollectionFixture<RedisIntegrationFixture>
{
    public const string Name = "Aspire Redis integration";
}

public sealed class RedisIntegrationFixture : IAsyncLifetime
{
    private static readonly RedisKey[] s_productionKeys =
    [
        LiveStatusRedisKeys.State,
        LiveStatusRedisKeys.YouTubeSubscription,
        LiveStatusRedisKeys.YouTubeConfirmation,
        LiveStatusRedisKeys.TwitchLeader,
        LiveStatusRedisKeys.YouTubeLeader,
    ];

    private readonly string _owner = Guid.NewGuid().ToString("N");
    private readonly HashSet<RedisKey> _ownedKeys = [];
    private IDistributedApplicationTestingBuilder? _builder;
    private DistributedApplication? _app;

    public ConnectionMultiplexer First { get; private set; } = null!;
    public ConnectionMultiplexer Second { get; private set; } = null!;
    public IDatabase Database => First.GetDatabase();

    public async Task InitializeAsync()
    {
        using var startup = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        try
        {
            _builder = DistributedApplicationTestingBuilder.Create();
            _builder.AddAzureManagedRedis("cache").RunAsContainer();
            _app = await _builder.BuildAsync(startup.Token);
            await _app.StartAsync(startup.Token);
            await _app.ResourceNotifications.WaitForResourceHealthyAsync("cache", startup.Token);
            var connection = await _app.GetConnectionStringAsync("cache", startup.Token)
                ?? throw new InvalidOperationException("Aspire did not provide the test Redis connection string.");
            var configuration = ConfigurationOptions.Parse(connection);
            configuration.AbortOnConnectFail = true;
            configuration.ConnectRetry = 0;
            configuration.ConnectTimeout = 5_000;
            configuration.AsyncTimeout = 5_000;
            configuration.ChannelPrefix = RedisChannel.Literal($"statichost-integration:{_owner}:");

            First = await ConnectionMultiplexer.ConnectAsync(configuration);
            await Database.PingAsync();
            _ownedKeys.UnionWith(s_productionKeys);
            Second = await ConnectionMultiplexer.ConnectAsync(configuration);
            await Second.GetDatabase().PingAsync();
        }
        catch
        {
            await DisposeAsync();
            throw;
        }
    }

    public string NewKey(string purpose)
    {
        var key = $"aspiredev:live:integration:{_owner}:{purpose}:{Guid.NewGuid():N}";
        _ownedKeys.Add(key);
        return key;
    }

    public string NewTwitchMessageId()
    {
        var messageId = $"{_owner}:{Guid.NewGuid():N}";
        _ownedKeys.Add(LiveStatusRedisKeys.TwitchMessagePrefix +
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(messageId))));
        return messageId;
    }

    public Task ResetAsync() =>
        First is not null
            ? Database.KeyDeleteAsync(_ownedKeys.ToArray())
            : Task.CompletedTask;

    public async Task DisposeAsync()
    {
        try
        {
            if (Second is not null)
            {
                await Second.DisposeAsync();
            }
            if (First is not null)
            {
                await First.DisposeAsync();
            }
        }
        finally
        {
            try
            {
                if (_app is not null)
                {
                    await _app.DisposeAsync();
                }
            }
            finally
            {
                if (_builder is not null)
                {
                    await _builder.DisposeAsync();
                }
            }
        }
    }
}

public abstract class RedisIntegrationTest(RedisIntegrationFixture fixture) : IAsyncLifetime
{
    protected static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(10);
    protected RedisIntegrationFixture Redis { get; } = fixture;

    public Task InitializeAsync() => Redis.ResetAsync();
    public Task DisposeAsync() => Redis.ResetAsync();

    private protected static RedisLiveStatusCoordination Coordination(
        IConnectionMultiplexer connection,
        TimeProvider? time = null) =>
        new(connection, time ?? TimeProvider.System, NullLogger<RedisLiveStatusCoordination>.Instance);

    private protected static RedisLiveStatusStore Store(
        IConnectionMultiplexer connection,
        TimeProvider? time = null) =>
        new(new LiveStatusRedis(connection), time ?? TimeProvider.System, NullLogger<RedisLiveStatusStore>.Instance);

    protected static LiveStatusBroadcaster Broadcaster(ILiveStatusStore store, TimeProvider? time = null) =>
        new(
            Options.Create(new LiveStatusOptions { CoalesceWindowMs = 0 }),
            NullLogger<LiveStatusBroadcaster>.Instance,
            time ?? TimeProvider.System,
            store);

    protected static async Task EventuallyAsync(
        Func<Task<bool>> condition,
        string because,
        Action? advance = null)
    {
        var elapsed = Stopwatch.StartNew();
        while (elapsed.Elapsed < TestTimeout)
        {
            if (await condition())
            {
                return;
            }

            advance?.Invoke();
            await Task.Delay(20);
        }

        Assert.Fail($"Timed out after {TestTimeout}: {because}");
    }

    protected static async Task StopLeaderAsync(Task task, CancellationTokenSource cancellation)
    {
        await cancellation.CancelAsync();
        try
        {
            await task.WaitAsync(TestTimeout);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
        }
    }
}

internal sealed class RedisIntegrationTimeProvider : TimeProvider
{
    private readonly FakeTimeProvider _clock = new(DateTimeOffset.UtcNow);
    private int _timersCreated;

    public int TimersCreated => Volatile.Read(ref _timersCreated);
    public override DateTimeOffset GetUtcNow() => _clock.GetUtcNow();
    public override long GetTimestamp() => _clock.GetTimestamp();
    public override long TimestampFrequency => _clock.TimestampFrequency;
    public void Advance(TimeSpan value) => _clock.Advance(value);

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        var timer = _clock.CreateTimer(callback, state, dueTime, period);
        Interlocked.Increment(ref _timersCreated);
        return timer;
    }
}
