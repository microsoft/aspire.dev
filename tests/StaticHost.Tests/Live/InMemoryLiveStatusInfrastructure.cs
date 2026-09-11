using System.Collections.Concurrent;

namespace StaticHost.Tests.Live;

internal sealed class InMemoryLiveStatusStore(TimeProvider timeProvider) : ILiveStatusStore
{
    private readonly Lock _gate = new();
    private LiveStatusState _state = LiveStatusState.CreateInitial();

    public ValueTask<LiveStatusState> GetAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            return ValueTask.FromResult(_state);
        }
    }

    public ValueTask<LiveStatusState> UpdateAsync(
        LiveStatusUpdate update,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            var next = LiveStatusReducer.Apply(
                _state.Snapshot,
                update,
                timeProvider.GetUtcNow());
            if (next != _state.Snapshot)
            {
                _state = new LiveStatusState(_state.Epoch, _state.Version + 1, next);
            }

            return ValueTask.FromResult(_state);
        }
    }
}

internal sealed class SingleInstanceLiveStatusCoordination : ILiveStatusCoordination
{
    private const string CompletedMessage = "completed";

    private readonly ConcurrentDictionary<string, string> _twitchMessageIds =
        new(StringComparer.Ordinal);

    public ValueTask<TwitchMessageAcquisition> AcquireTwitchMessageAsync(
        string messageId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var ownerToken = Guid.NewGuid().ToString("N");

        if (_twitchMessageIds.TryAdd(messageId, ownerToken))
        {
            return ValueTask.FromResult(new TwitchMessageAcquisition(
                TwitchMessageAcquisitionStatus.Acquired,
                new SingleInstanceTwitchMessageLease(
                    _twitchMessageIds,
                    messageId,
                    ownerToken)));
        }

        return ValueTask.FromResult(new TwitchMessageAcquisition(
            _twitchMessageIds.TryGetValue(messageId, out var current) &&
                string.Equals(current, CompletedMessage, StringComparison.Ordinal)
                    ? TwitchMessageAcquisitionStatus.Completed
                    : TwitchMessageAcquisitionStatus.Processing));
    }

    public ValueTask<bool> TryQueueYouTubeConfirmationAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return ValueTask.FromResult(true);
    }

    public Task RunAsLeaderAsync(
        string leaseKey,
        Func<CancellationToken, Task> action,
        CancellationToken cancellationToken) =>
        action(cancellationToken);

    private sealed class SingleInstanceTwitchMessageLease(
        ConcurrentDictionary<string, string> messageIds,
        string messageId,
        string ownerToken) : ITwitchMessageLease
    {
        private bool _completed;

        public ValueTask CompleteAsync()
        {
            if (!messageIds.TryUpdate(messageId, CompletedMessage, ownerToken))
            {
                throw new InvalidOperationException(
                    $"Twitch message lease '{messageId}' expired before processing completed.");
            }

            _completed = true;
            return ValueTask.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            if (!_completed &&
                messageIds.TryGetValue(messageId, out var current) &&
                string.Equals(current, ownerToken, StringComparison.Ordinal))
            {
                messageIds.TryRemove(messageId, out _);
            }

            return ValueTask.CompletedTask;
        }
    }
}

internal sealed class YouTubeWebSubSubscriptionState : IYouTubeWebSubSubscriptionState
{
    private readonly Lock _gate = new();
    private YouTubeWebSubSubscriptionData _state = YouTubeWebSubSubscriptionData.Empty;

    public ValueTask<YouTubeWebSubSubscriptionRequest?> TryBeginSubscriptionAsync(
        string channelId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            var request = YouTubeWebSubSubscriptionTransitions.TryBegin(
                _state,
                channelId,
                now,
                out _state);
            return ValueTask.FromResult(request);
        }
    }

    public ValueTask MarkRequestFailedAsync(
        YouTubeWebSubSubscriptionRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            _state = YouTubeWebSubSubscriptionTransitions.MarkRequestFailed(_state, request);
        }

        return ValueTask.CompletedTask;
    }

    public ValueTask MarkRequestSentAsync(
        YouTubeWebSubSubscriptionRequest request,
        DateTimeOffset sentAt,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            _state = YouTubeWebSubSubscriptionTransitions.MarkRequestSent(
                _state,
                request,
                sentAt);
        }

        return ValueTask.CompletedTask;
    }

    public ValueTask<bool> TryConfirmSubscriptionAsync(
        string mode,
        string topic,
        string verifyToken,
        int leaseSeconds,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            var confirmed = YouTubeWebSubSubscriptionTransitions.TryConfirm(
                _state,
                mode,
                topic,
                verifyToken,
                leaseSeconds,
                now,
                out _state);
            return ValueTask.FromResult(confirmed);
        }
    }

    public ValueTask<DateTimeOffset> GetRenewAtAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            return ValueTask.FromResult(_state.RenewAt);
        }
    }
}
