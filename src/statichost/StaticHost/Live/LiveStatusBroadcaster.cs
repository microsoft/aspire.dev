using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace StaticHost.Live;

/// <summary>
/// Mutator passed to <see cref="LiveStatusBroadcaster.UpdateAsync"/> to compose a
/// new snapshot from the previous one.
/// </summary>
public sealed class LiveStatusUpdate
{
    /// <summary>Set to non-null to overwrite the Twitch sub-status.</summary>
    public TwitchStatus? Twitch { get; set; }

    /// <summary>Set to non-null to overwrite the YouTube sub-status.</summary>
    public YouTubeStatus? YouTube { get; set; }
}

/// <summary>A snapshot and its serialized SSE frame, shared by all subscribers.</summary>
public sealed class LiveStatusEvent(LiveStatus snapshot)
{
    /// <summary>The immutable live-status snapshot.</summary>
    public LiveStatus Snapshot { get; } = snapshot;

    internal ReadOnlyMemory<byte> Frame { get; } = Encoding.UTF8.GetBytes(
        $"event: state\ndata: {JsonSerializer.Serialize(snapshot, LiveStatusJsonContext.Default.LiveStatus)}\n\n");
}

/// <summary>
/// Per-process replica of the current <see cref="LiveStatus"/> that fans
/// distributed changes out to local SSE subscribers.
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
/// <para>Subscriber registration and fan-out share a lock; snapshots remain lock-free to read.</para>
/// </remarks>
/// <remarks>Creates the broadcaster.</remarks>
public sealed class LiveStatusBroadcaster(
    IOptions<LiveStatusOptions> options,
    ILogger<LiveStatusBroadcaster> logger,
    TimeProvider? timeProvider = null,
    ILiveStatusStore? store = null) : IDisposable
{
    private readonly TimeProvider _time = timeProvider ?? TimeProvider.System;
    private readonly ILiveStatusStore _store = store ?? new InMemoryLiveStatusStore(timeProvider);
    private readonly TimeSpan _coalesceWindow = TimeSpan.FromMilliseconds(options.Value.CoalesceWindowMs);

    private readonly Lock _gate = new();
    private LiveStatusEvent _current = new(LiveStatus.Idle);
    private Guid? _currentEpoch;
    private long _currentVersion;
    private LiveStatusState? _pending;
    private ITimer? _flushTimer;
    private readonly HashSet<ChannelWriter<LiveStatusEvent>> _subscribers = [];

    /// <summary>Returns the current snapshot. Lock-free.</summary>
    public LiveStatus Current => Volatile.Read(ref _current).Snapshot;

    /// <summary>Reads the authoritative distributed snapshot.</summary>
    public async ValueTask<LiveStatus> GetCurrentAsync(CancellationToken cancellationToken = default) =>
        (await _store.GetAsync(cancellationToken).ConfigureAwait(false)).Snapshot;

    /// <summary>
    /// Reloads the authoritative state into this process before an SSE client
    /// subscribes, recovering any pub/sub messages missed during reconnection.
    /// </summary>
    internal async ValueTask RefreshAsync(CancellationToken cancellationToken = default)
    {
        var state = await _store.GetAsync(cancellationToken).ConfigureAwait(false);
        ApplyState(state, flushImmediately: true, allowEpochChange: true);
    }

    /// <summary>
    /// Subscribe to live-status changes. The returned <see cref="ChannelReader{T}"/>
    /// receives the current snapshot immediately followed by every subsequent
    /// change. Dispose the returned token to unsubscribe.
    /// </summary>
    public (ChannelReader<LiveStatusEvent> Reader, IDisposable Unsubscribe) Subscribe()
    {
        var channel = Channel.CreateBounded<LiveStatusEvent>(new BoundedChannelOptions(8)
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
            _subscribers.Add(channel.Writer);
        }

        return (channel.Reader, new Unsubscriber(this, channel.Writer));
    }

    /// <summary>
    /// Apply a partial update. Triggers a coalesced broadcast.
    /// Setting only fields you want to change leaves the others as-is.
    /// </summary>
    public async ValueTask<LiveStatus> UpdateAsync(
        LiveStatusUpdate update,
        CancellationToken cancellationToken = default)
    {
        var state = await _store.UpdateAsync(update, cancellationToken).ConfigureAwait(false);
        ApplyState(state, allowEpochChange: true);
        return state.Snapshot;
    }

    /// <summary>Synchronously applies an update for focused unit tests.</summary>
    internal void Update(LiveStatusUpdate update) =>
        UpdateAsync(update).AsTask().GetAwaiter().GetResult();

    internal bool ApplyState(
        LiveStatusState state,
        bool flushImmediately = false,
        bool allowEpochChange = false)
    {
        lock (_gate)
        {
            var latestEpoch = _pending?.Epoch ?? _currentEpoch;
            var latestVersion = _pending?.Version ?? _currentVersion;
            if (latestEpoch is { } epoch)
            {
                if (state.Epoch != epoch)
                {
                    if (!allowEpochChange)
                    {
                        return false;
                    }
                }
                else if (state.Version <= latestVersion)
                {
                    return true;
                }
            }

            _pending = state;

            if (flushImmediately || _coalesceWindow == TimeSpan.Zero)
            {
                FlushLocked();
                return true;
            }

            _flushTimer ??= _time.CreateTimer(
                static timerState => ((LiveStatusBroadcaster)timerState!).Flush(),
                this,
                _coalesceWindow,
                Timeout.InfiniteTimeSpan);

            _flushTimer.Change(_coalesceWindow, Timeout.InfiniteTimeSpan);
            return true;
        }
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
        if ((next.Snapshot with { UpdatedAt = _current.Snapshot.UpdatedAt }) == _current.Snapshot)
        {
            if (next.Snapshot != _current.Snapshot)
            {
                Volatile.Write(ref _current, new LiveStatusEvent(next.Snapshot));
            }

            _currentEpoch = next.Epoch;
            _currentVersion = next.Version;
            _pending = null;
            return;
        }

        var published = new LiveStatusEvent(next.Snapshot);
        Volatile.Write(ref _current, published);
        _currentEpoch = next.Epoch;
        _currentVersion = next.Version;
        _pending = null;

        logger.LogInformation(
            "Live status updated to version {Version}: isLive={IsLive} primary={Primary} twitch={Twitch} youtube={YouTube}",
            next.Version,
            next.Snapshot.IsLive,
            next.Snapshot.PrimarySource,
            next.Snapshot.Twitch.Live,
            next.Snapshot.YouTube.Live);

        foreach (var writer in _subscribers)
        {
            // BoundedChannel + DropOldest means TryWrite will never fail.
            writer.TryWrite(published);
        }
    }

    /// <summary>Forces an immediate flush of any pending coalesced update. Test hook.</summary>
    internal void FlushNow() => Flush();

    private void RemoveSubscriber(ChannelWriter<LiveStatusEvent> writer)
    {
        lock (_gate)
        {
            _subscribers.Remove(writer);
        }

        try { writer.TryComplete(); } catch { /* best-effort */ }
    }

    /// <inheritdoc/>
    public void Dispose()
    {
        _flushTimer?.Dispose();
    }

    private sealed class Unsubscriber(LiveStatusBroadcaster owner, ChannelWriter<LiveStatusEvent> writer) : IDisposable
    {
        private int _disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            owner.RemoveSubscriber(writer);
        }
    }
}
