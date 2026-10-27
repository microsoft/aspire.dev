namespace StaticHost.Tests.Live;

public sealed class LiveStatusCoordinationTests
{
    [Fact]
    public async Task TwitchMessageLease_AllowsRetryAfterFailureAndSuppressesCompletedReplay()
    {
        var coordination = new SingleInstanceLiveStatusCoordination();

        var failed = await coordination.AcquireTwitchMessageAsync("message-1");
        Assert.Equal(TwitchMessageAcquisitionStatus.Acquired, failed.Status);
        var failedLease = Assert.IsAssignableFrom<ITwitchMessageLease>(failed.Lease);
        Assert.Equal(
            TwitchMessageAcquisitionStatus.Processing,
            (await coordination.AcquireTwitchMessageAsync("message-1")).Status);
        await failedLease.DisposeAsync();

        var completed = await coordination.AcquireTwitchMessageAsync("message-1");
        Assert.Equal(TwitchMessageAcquisitionStatus.Acquired, completed.Status);
        var completedLease = Assert.IsAssignableFrom<ITwitchMessageLease>(completed.Lease);
        await completedLease.CompleteAsync();
        await completedLease.DisposeAsync();

        Assert.Equal(
            TwitchMessageAcquisitionStatus.Completed,
            (await coordination.AcquireTwitchMessageAsync("message-1")).Status);
    }

    [Fact]
    public async Task RunAsLeaderAsync_ExecutesActionInSingleInstanceMode()
    {
        var coordination = new SingleInstanceLiveStatusCoordination();
        var invoked = false;

        await coordination.RunAsLeaderAsync(
            "provider",
            cancellationToken =>
            {
                Assert.False(cancellationToken.IsCancellationRequested);
                invoked = true;
                return Task.CompletedTask;
            },
            CancellationToken.None);

        Assert.True(invoked);
    }
}
