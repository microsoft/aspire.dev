using System.Threading.Channels;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using StaticHost.Live;
using Xunit;

namespace StaticHost.Tests.Live;

public class LiveStatusBroadcasterTests
{
    private static (LiveStatusBroadcaster Broadcaster, FakeTimeProvider Time) Create(int coalesceMs = 750)
    {
        var time = new FakeTimeProvider(startDateTime: DateTimeOffset.UnixEpoch);
        var opts = Options.Create(new LiveStatusOptions { CoalesceWindowMs = coalesceMs });
        var b = new LiveStatusBroadcaster(opts, NullLogger<LiveStatusBroadcaster>.Instance, time);
        return (b, time);
    }

    [Fact]
    public void Update_sets_primary_to_first_live_source()
    {
        var (b, time) = Create();
        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "aspiredotdev", null) });
        time.Advance(TimeSpan.FromSeconds(1));
        Assert.True(b.Current.IsLive);
        Assert.Equal("twitch", b.Current.PrimarySource);
        Assert.False(string.IsNullOrEmpty(b.Current.LiveSessionId));
    }

    [Fact]
    public void Primary_and_live_session_are_sticky_when_second_source_joins()
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
    public void Primary_swaps_to_remaining_source_when_original_goes_offline()
    {
        var (b, time) = Create();

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(true, "x", null) });
        time.Advance(TimeSpan.FromSeconds(1));
        b.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "v") });
        time.Advance(TimeSpan.FromSeconds(1));

        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(false, null, null) });
        time.Advance(TimeSpan.FromSeconds(1));

        Assert.Equal("youtube", b.Current.PrimarySource);
        Assert.True(b.Current.IsLive);
        Assert.False(string.IsNullOrEmpty(b.Current.LiveSessionId));
    }

    [Fact]
    public void PrimarySource_is_null_when_nothing_is_live()
    {
        var (b, _) = Create();
        Assert.Null(b.Current.PrimarySource);
        Assert.Null(b.Current.LiveSessionId);
        Assert.False(b.Current.IsLive);
    }

    [Fact]
    public void LiveSessionId_rotates_after_all_sources_go_offline()
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
    public async Task Coalesce_window_collapses_burst_into_single_event()
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
    public void No_op_update_does_not_schedule_broadcast()
    {
        var (b, time) = Create(coalesceMs: 100);
        b.Update(new LiveStatusUpdate { Twitch = new TwitchStatus(false, null, null) });
        time.Advance(TimeSpan.FromMilliseconds(200));
        Assert.Equal(LiveStatus.Idle.IsLive, b.Current.IsLive);
        Assert.Null(b.Current.PrimarySource);
    }

    [Fact]
    public async Task Subscribe_seeds_with_current_snapshot()
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
    public async Task Unsubscribe_stops_delivering_events()
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
