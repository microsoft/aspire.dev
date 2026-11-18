using System.Reflection;
using StackExchange.Redis;

namespace StaticHost.Tests.Live;

// RedisTimeoutException derives from TimeoutException, not RedisException, so
// background loops must handle it explicitly or it stops the host.
public sealed class RedisTimeoutResilienceTests
{
    [Fact]
    public async Task RunAsLeaderAsync_RetriesAcquisitionTimeout_AndIgnoresReleaseTimeout()
    {
        var time = new FakeTimeProvider();
        var acquisitions = 0;
        var database = RedisProxy.Create<IDatabase>(method => method.Name switch
        {
            nameof(IDatabase.StringSetAsync) => ++acquisitions == 1
                ? Task.FromException<bool>(Timeout())
                : Task.FromResult(true),
            nameof(IDatabase.ScriptEvaluateAsync) => Task.FromException<RedisResult>(Timeout()),
            _ => throw new NotSupportedException(method.Name),
        });
        var multiplexer = RedisProxy.Create<IConnectionMultiplexer>(method =>
            method.Name == nameof(IConnectionMultiplexer.GetDatabase)
                ? database
                : throw new NotSupportedException(method.Name));
        var coordination = new RedisLiveStatusCoordination(
            multiplexer, time, NullLogger<RedisLiveStatusCoordination>.Instance);
        var invoked = false;

        var leader = coordination.RunAsLeaderAsync(
            "leader",
            _ =>
            {
                invoked = true;
                return Task.CompletedTask;
            },
            CancellationToken.None);

        for (var i = 0; i < 100 && !leader.IsCompleted; i++)
        {
            time.Advance(TimeSpan.FromSeconds(5));
            await Task.Delay(10);
        }

        await leader.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.True(invoked);
        Assert.Equal(2, acquisitions);
    }

    [Fact]
    public async Task Synchronizer_KeepsRunningWhenRefreshTimesOut()
    {
        var time = new FakeTimeProvider();
        var subscriber = RedisProxy.Create<ISubscriber>(method => method.Name switch
        {
            nameof(ISubscriber.SubscribeAsync) or nameof(ISubscriber.UnsubscribeAsync) => Task.CompletedTask,
            _ => throw new NotSupportedException(method.Name),
        });
        var multiplexer = RedisProxy.Create<IConnectionMultiplexer>(method =>
            method.Name == nameof(IConnectionMultiplexer.GetSubscriber)
                ? subscriber
                : throw new NotSupportedException(method.Name));
        var store = new TimingOutLiveStatusStore();
        using var broadcaster = LiveTestHelpers.CreateBroadcaster(timeProvider: time);
        using var synchronizer = new LiveStatusSynchronizer(
            multiplexer, store, broadcaster, time, NullLogger<LiveStatusSynchronizer>.Instance);

        await synchronizer.StartAsync(CancellationToken.None);
        try
        {
            for (var i = 0; i < 100 && store.Reads < 2; i++)
            {
                time.Advance(TimeSpan.FromSeconds(30));
                await Task.Delay(10);
            }

            Assert.True(store.Reads >= 2, "the resync loop should retry after a timed-out refresh");
            Assert.False(synchronizer.ExecuteTask!.IsCompleted);
        }
        finally
        {
            using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await synchronizer.StopAsync(stop.Token);
        }
    }

    private static RedisTimeoutException Timeout() =>
        new("Timeout awaiting response", CommandStatus.Sent);

    private sealed class TimingOutLiveStatusStore : ILiveStatusStore
    {
        private int _reads;

        public int Reads => Volatile.Read(ref _reads);

        public ValueTask<LiveStatusState> GetAsync(CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _reads);
            return ValueTask.FromException<LiveStatusState>(Timeout());
        }

        public ValueTask<LiveStatusState> UpdateAsync(
            LiveStatusUpdate update,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromException<LiveStatusState>(Timeout());
    }
}

public class RedisProxy : DispatchProxy
{
    private Func<MethodInfo, object?> _handler = null!;

    public static T Create<T>(Func<MethodInfo, object?> handler)
        where T : class
    {
        var proxy = Create<T, RedisProxy>();
        ((RedisProxy)(object)proxy)._handler = handler;
        return proxy;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) =>
        _handler(targetMethod!);
}
