using System.Collections.Immutable;
using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace StaticHost.Live;

/// <summary>
/// Mutator passed to <see cref="LiveStatusBroadcaster.Update"/> to compose a
/// new snapshot from the previous one.
/// </summary>
public sealed class LiveStatusUpdate
{
    /// <summary>Set to non-null to overwrite the Twitch sub-status.</summary>
    public TwitchStatus? Twitch { get; set; }

    /// <summary>Set to non-null to overwrite the YouTube sub-status.</summary>
    public YouTubeStatus? YouTube { get; set; }
}

/// <summary>
/// Singleton holding the current <see cref="LiveStatus"/> and fanning changes
/// out to all SSE subscribers.
/// </summary>
/// <remarks>
/// <para>
/// Aggregation rules:
/// <list type="bullet">
/// <item><c>IsLive</c> = <c>Twitch.Live || YouTube.Live</c>.</item>
/// <item><c>PrimarySource</c> is <b>sticky</b>: once a source becomes the
/// primary it stays primary until it goes offline. This prevents the videos-
/// page tab and the floating PiP from yanking around when the second source's
/// webhook lands seconds after the first.</item>
/// <item><c>LiveSessionId</c> starts when the first source goes live and stays
/// stable while any source remains live. This lets clients treat Twitch and
/// YouTube webhooks that arrive moments apart as one user notification.</item>
/// </list>
/// </para>
/// <para>
/// Outgoing events are coalesced over a configurable window
/// (<see cref="LiveStatusOptions.CoalesceWindowMs"/>, default 750ms) so a
/// near-simultaneous Twitch + YouTube going-live race produces exactly
/// one SSE update.
/// </para>
/// <para>Subscriber list is copy-on-write (lock-free reads).</para>
/// </remarks>
/// <remarks>Creates the broadcaster.</remarks>
public sealed class LiveStatusBroadcaster(
    IOptions<LiveStatusOptions> options,
    ILogger<LiveStatusBroadcaster> logger,
    TimeProvider? timeProvider = null) : IDisposable
{
    private readonly TimeProvider _time = timeProvider ?? TimeProvider.System;
    private readonly TimeSpan _coalesceWindow = TimeSpan.FromMilliseconds(options.Value.CoalesceWindowMs);

    private readonly Lock _gate = new();
    private LiveStatus _current = LiveStatus.Idle;
    private LiveStatus? _pending;
    private ITimer? _flushTimer;
    private ImmutableArray<ChannelWriter<LiveStatus>> _subscribers = [];

    /// <summary>Returns the current snapshot. Lock-free.</summary>
    public LiveStatus Current => Volatile.Read(ref _current);

    /// <summary>
    /// Subscribe to live-status changes. The returned <see cref="ChannelReader{T}"/>
    /// receives the current snapshot immediately followed by every subsequent
    /// change. Dispose the returned token to unsubscribe.
    /// </summary>
    public (ChannelReader<LiveStatus> Reader, IDisposable Unsubscribe) Subscribe()
    {
        var channel = Channel.CreateBounded<LiveStatus>(new BoundedChannelOptions(8)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
        });

        // Seed with current state and register the subscriber atomically under
        // the same lock. Otherwise a Flush landing between the seed write and the
        // Add would deliver the new state to every other subscriber and leave this
        // one stuck on the stale seed until the next change.
        lock (_gate)
        {
            channel.Writer.TryWrite(_current);
            _subscribers = _subscribers.Add(channel.Writer);
        }

        return (channel.Reader, new Unsubscriber(this, channel.Writer));
    }

    /// <summary>
    /// Apply a partial update. Triggers a coalesced broadcast.
    /// Setting only fields you want to change leaves the others as-is.
    /// </summary>
    public void Update(LiveStatusUpdate update)
    {
        lock (_gate)
        {
            var basis = _pending ?? _current;
            var twitch = update.Twitch ?? basis.Twitch;
            var youtube = update.YouTube ?? basis.YouTube;

            // Sticky primary: keep the previous primary if it's still live;
            // otherwise pick whichever source is live. Resolve against the pending
            // basis (not _current) so that during the coalescing window the source
            // that arrived first stays primary even if a second source's update
            // lands before the flush.
            var primary = ResolvePrimary(basis.PrimarySource, twitch, youtube);
            var isLive = twitch.Live || youtube.Live;
            var now = _time.GetUtcNow();
            var liveSessionId = ResolveLiveSessionId(basis, isLive, now);

            var next = new LiveStatus(
                IsLive: isLive,
                PrimarySource: primary,
                Twitch: twitch,
                YouTube: youtube,
                LiveSessionId: liveSessionId,
                UpdatedAt: now);

            // Ignore UpdatedAt when deciding whether anything substantive changed;
            // otherwise the ever-advancing timestamp makes every reconcile look new
            // and forces a redundant broadcast. When nothing else changed, keep the
            // previous snapshot (and its UpdatedAt) untouched.
            if (_pending is null && (next with { UpdatedAt = _current.UpdatedAt }) == _current)
            {
                return;
            }

            _pending = next;

            if (_coalesceWindow == TimeSpan.Zero)
            {
                FlushLocked();
                return;
            }

            _flushTimer ??= _time.CreateTimer(static state => ((LiveStatusBroadcaster)state!).Flush(),
                this, _coalesceWindow, Timeout.InfiniteTimeSpan);

            _flushTimer.Change(_coalesceWindow, Timeout.InfiniteTimeSpan);
        }
    }

    private static string? ResolvePrimary(string? previous, TwitchStatus twitch, YouTubeStatus youtube)
    {
        if (previous == "twitch" && twitch.Live) return "twitch";
        if (previous == "youtube" && youtube.Live) return "youtube";
        if (twitch.Live) return "twitch";
        if (youtube.Live) return "youtube";
        return null;
    }

    private static string? ResolveLiveSessionId(LiveStatus basis, bool isLive, DateTimeOffset now)
    {
        if (!isLive) return null;
        if (basis.IsLive && !string.IsNullOrEmpty(basis.LiveSessionId)) return basis.LiveSessionId;
        return $"live-{now.ToUnixTimeMilliseconds():x}";
    }

    private void Flush()
    {
        lock (_gate)
        {
            FlushLocked();
        }
    }

    private void FlushLocked()
    {
        if (_pending is not { } next) return;
        // Excluding UpdatedAt: if an update and a later revert coalesce into the
        // same substantive state as _current, don't broadcast a timestamp-only bump.
        if ((next with { UpdatedAt = _current.UpdatedAt }) == _current) { _pending = null; return; }

        Volatile.Write(ref _current, next);
        _pending = null;

        logger.LogInformation(
            "Live status updated: isLive={IsLive} primary={Primary} twitch={Twitch} youtube={YouTube}",
            next.IsLive, next.PrimarySource, next.Twitch.Live, next.YouTube.Live);

        var subs = _subscribers;
        foreach (var writer in subs)
        {
            // BoundedChannel + DropOldest means TryWrite will never fail.
            writer.TryWrite(next);
        }
    }

    /// <summary>Forces an immediate flush of any pending coalesced update. Test hook.</summary>
    internal void FlushNow() => Flush();

    private void RemoveSubscriber(ChannelWriter<LiveStatus> writer)
    {
        lock (_gate)
        {
            _subscribers = _subscribers.Remove(writer);
        }

        try { writer.TryComplete(); } catch { /* best-effort */ }
    }

    /// <inheritdoc/>
    public void Dispose()
    {
        _flushTimer?.Dispose();
    }

    private sealed class Unsubscriber(LiveStatusBroadcaster owner, ChannelWriter<LiveStatus> writer) : IDisposable
    {
        private int _disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            owner.RemoveSubscriber(writer);
        }
    }
}
