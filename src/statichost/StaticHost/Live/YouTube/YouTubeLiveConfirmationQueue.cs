using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace StaticHost.Live.YouTube;

/// <summary>
/// Bounded, coalescing background worker that runs the confirming YouTube
/// "am I actually live?" poll requested by inbound WebSub notifications.
/// </summary>
/// <remarks>
/// A signed WebSub notification only tells us that <i>something</i> changed on the
/// channel feed, so we still have to call the Data API to learn the real live
/// state. Running that poll inline in the webhook handler (previously an untracked
/// <c>Task.Run</c> with <see cref="CancellationToken.None"/>) let bursts of retried
/// notifications fan out into concurrent, quota-consuming polls that could also
/// complete out of order or outlive host shutdown. This worker collapses any number
/// of pending requests into a single in-flight poll and is tied to the host's
/// stopping token so it drains cleanly on shutdown.
/// </remarks>
public sealed class YouTubeLiveConfirmationQueue(
    IYouTubeClient client,
    LiveStatusBroadcaster broadcaster,
    IOptionsMonitor<LiveStatusOptions> options,
    ILogger<YouTubeLiveConfirmationQueue> logger) : BackgroundService
{
    // Capacity 1 + DropWrite: at most one confirmation can be queued while one is
    // in flight, so a burst of notifications coalesces into a single extra poll.
    private readonly Channel<byte> _signal = Channel.CreateBounded<byte>(
        new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });

    /// <summary>
    /// Requests a confirming poll. Coalesced: concurrent or rapid calls collapse
    /// into a single poll. Safe to call from any thread.
    /// </summary>
    public void RequestConfirmation() => _signal.Writer.TryWrite(0);

    /// <inheritdoc/>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (await _signal.Reader.WaitToReadAsync(stoppingToken).ConfigureAwait(false))
            {
                // Drain every queued signal so a burst becomes exactly one poll.
                while (_signal.Reader.TryRead(out _))
                {
                }

                try
                {
                    await LiveStatusEndpointRouteBuilderExtensions.ConfirmYouTubeLiveStatusAsync(
                        options.CurrentValue.YouTube,
                        client,
                        broadcaster,
                        logger,
                        stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Confirming poll after YouTube webhook failed.");
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Host is shutting down.
        }
    }
}
