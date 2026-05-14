namespace StaticHost.Tests.Live;

public sealed class LiveStatusBroadcasterTests
{
    private static (LiveStatusBroadcaster Broadcaster, FakeTimeProvider Time) Create(int coalesceMs = 750)
    {
        var time = new FakeTimeProvider(startDateTime: DateTimeOffset.UnixEpoch);
        var opts = Options.Create(new LiveStatusOptions { CoalesceWindowMs = coalesceMs });
        var b = new LiveStatusBroadcaster(opts, NullLogger<LiveStatusBroadcaster>.Instance, time);
        return (b, time);
    }

    [Fact]
    public void Update_SetsPrimaryToFirstLiveSource()
    {
        var (b, time) = Create();
        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "aspiredotdev", null) });
        time.Advance(TimeSpan.FromSeconds(1));
        Assert.True(b.Current.IsLive);
        Assert.Equal("twitch", b.Current.PrimarySource);
        Assert.False(string.IsNullOrEmpty(b.Current.LiveSessionId));
    }

    [Fact]
    public void Update_KeepsPrimaryAndLiveSessionWhenSecondSourceJoins()
    {
        var (b, time) = Create();

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "aspiredotdev", null) });
        time.Advance(TimeSpan.FromSeconds(1));
        var firstSessionId = b.Current.LiveSessionId;

        b.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "abc123") });
        time.Advance(TimeSpan.FromSeconds(1));

        Assert.Equal("twitch", b.Current.PrimarySource);
        Assert.Equal(firstSessionId, b.Current.LiveSessionId);
        Assert.True(b.Current.IsLive);
        Assert.True(b.Current.Twitch.Live);
        Assert.True(b.Current.YouTube.Live);
    }

    [Fact]
    public void Update_SwapsPrimaryToRemainingSourceWhenOriginalGoesOffline()
    {
        var (b, time) = Create();

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "x", null) });
        time.Advance(TimeSpan.FromSeconds(1));
        var firstSessionId = b.Current.LiveSessionId;

        b.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "v") });
        time.Advance(TimeSpan.FromSeconds(1));

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(false, null, null) });
        time.Advance(TimeSpan.FromSeconds(1));

        Assert.Equal("youtube", b.Current.PrimarySource);
        Assert.True(b.Current.IsLive);
        Assert.Equal(firstSessionId, b.Current.LiveSessionId);
    }

    [Fact]
    public void Current_HasNoPrimarySourceWhenNothingIsLive()
    {
        var (b, _) = Create();
        Assert.Null(b.Current.PrimarySource);
        Assert.Null(b.Current.LiveSessionId);
        Assert.False(b.Current.IsLive);
    }

    [Fact]
    public void Update_RotatesLiveSessionIdAfterAllSourcesGoOffline()
    {
        var (b, time) = Create();

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "x", null) });
        time.Advance(TimeSpan.FromSeconds(1));
        var firstSessionId = b.Current.LiveSessionId;

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(false, null, null) });
        time.Advance(TimeSpan.FromSeconds(1));
        Assert.Null(b.Current.LiveSessionId);

        time.Advance(TimeSpan.FromMinutes(1));
        b.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "v") });
        time.Advance(TimeSpan.FromSeconds(1));

        Assert.NotEqual(firstSessionId, b.Current.LiveSessionId);
    }

    [Fact]
    public async Task Update_CoalescesBurstIntoSingleEvent()
    {
        var (b, time) = Create(coalesceMs: 750);
        var (reader, sub) = b.Subscribe();

        var seeded = await reader.ReadAsync();
        Assert.False(seeded.IsLive);

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "x", null) });
        b.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "v") });

        time.Advance(TimeSpan.FromMilliseconds(100));
        Assert.False(reader.TryRead(out _));

        time.Advance(TimeSpan.FromMilliseconds(800));

        var combined = await reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2));
        Assert.True(combined.IsLive);
        Assert.True(combined.Twitch.Live);
        Assert.True(combined.YouTube.Live);
        Assert.False(string.IsNullOrEmpty(combined.LiveSessionId));
        Assert.False(reader.TryRead(out _));

        sub.Dispose();
    }

    [Fact]
    public void Update_DoesNotScheduleBroadcastForNoOp()
    {
        var (b, time) = Create(coalesceMs: 100);
        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(false, null, null) });
        time.Advance(TimeSpan.FromMilliseconds(200));
        Assert.Equal(LiveStatus.Idle.IsLive, b.Current.IsLive);
        Assert.Null(b.Current.PrimarySource);
    }

    [Fact]
    public async Task Subscribe_SeedsWithCurrentSnapshot()
    {
        var (b, _) = Create();
        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "x", null) });
        b.FlushNow();

        var (reader, sub) = b.Subscribe();
        var first = await reader.ReadAsync();
        Assert.True(first.IsLive);
        sub.Dispose();
    }

    [Fact]
    public async Task Unsubscribe_StopsDeliveringEvents()
    {
        var (b, time) = Create(coalesceMs: 1);
        var (reader, sub) = b.Subscribe();
        await reader.ReadAsync();

        sub.Dispose();

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "x", null) });
        time.Advance(TimeSpan.FromMilliseconds(50));

        await Assert.ThrowsAnyAsync<ChannelClosedException>(async () => await reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(1)));
    }
}
