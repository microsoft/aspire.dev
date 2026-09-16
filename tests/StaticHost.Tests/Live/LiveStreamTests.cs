namespace StaticHost.Tests.Live;

public sealed class LiveStreamTests
{
    [Fact]
    public async Task StreamSse_SendsHeartbeatsThenUpdatesAndStopsOnDisconnect()
    {
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        using var broadcaster = LiveTestHelpers.CreateBroadcaster(timeProvider: time);
        using var cancellation = new CancellationTokenSource();
        using var body = new RecordingStream();
        var context = new DefaultHttpContext();
        context.Response.Body = body;

        var streaming = LiveStatusEndpointRouteBuilderExtensions.StreamSse(
            context, broadcaster, time, cancellation.Token);
        Assert.StartsWith("event: state\n", await body.ReadWriteAsync());

        for (var i = 0; i < 100; i++)
        {
            time.Advance(TimeSpan.FromSeconds(15));
            Assert.Equal(":hb\n\n", await body.ReadWriteAsync());
        }

        broadcaster.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "aspiredotdev", null) });
        var live = await body.ReadWriteAsync();
        Assert.Contains("\"isLive\":true", live, StringComparison.Ordinal);
        Assert.False(streaming.IsCompleted);

        await cancellation.CancelAsync();
        await streaming.WaitAsync(TimeSpan.FromSeconds(5));
        time.Advance(TimeSpan.FromMinutes(1));
        Assert.False(body.Writes.Reader.TryRead(out _));
    }

    private sealed class RecordingStream : MemoryStream
    {
        public Channel<string> Writes { get; } = Channel.CreateUnbounded<string>();

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            Writes.Writer.TryWrite(Encoding.UTF8.GetString(buffer.Span));
            return ValueTask.CompletedTask;
        }

        public async Task<string> ReadWriteAsync() =>
            await Writes.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(5));
    }
}
