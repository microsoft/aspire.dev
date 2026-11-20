namespace StaticHost.Routing;

/// <summary>
/// The static files the routing middlewares resolve against, shared so the web root is
/// enumerated once instead of per middleware.
/// </summary>
/// <remarks>
/// Built on first use rather than at startup: CI starts StaticHost before it unpacks the site
/// into the web root, and unpacks the frontend's locale manifest last, so the manifest marks a
/// complete web root. Until it appears, the index is rebuilt at
/// most once per <see cref="RetryInterval"/>, for up to <see cref="RetryWindow"/>; production
/// ships the manifest, so it is built once.
/// </remarks>
internal sealed class StaticWebRootIndex(string webRootPath)
{
    internal static readonly TimeSpan RetryInterval = TimeSpan.FromSeconds(1);
    internal static readonly TimeSpan RetryWindow = TimeSpan.FromMinutes(5);

    private readonly Lock _lock = new();
    private readonly long _startedAt = Environment.TickCount64;
    private volatile Snapshot? _snapshot;
    private long _nextAttemptAt;

    public sealed record Snapshot(CanonicalPathResolver Paths, LocaleFallbackResolver Locales, bool Final);

    public Snapshot Current
    {
        get
        {
            var snapshot = _snapshot;
            if (snapshot is { Final: true } ||
                (snapshot is not null && Environment.TickCount64 < Interlocked.Read(ref _nextAttemptAt)))
            {
                return snapshot;
            }

            lock (_lock)
            {
                var now = Environment.TickCount64;
                snapshot = _snapshot;
                if (snapshot is { Final: true } || (snapshot is not null && now < _nextAttemptAt))
                {
                    return snapshot;
                }

                var paths = new CanonicalPathResolver(webRootPath);
                var hasManifest = File.Exists(Path.Combine(webRootPath, LocaleFallbackResolver.ManifestPath));
                snapshot = new Snapshot(
                    paths,
                    new LocaleFallbackResolver(paths, LocaleFallbackResolver.ReadLocales(webRootPath)),
                    Final: hasManifest || now - _startedAt >= RetryWindow.TotalMilliseconds);
                Interlocked.Exchange(ref _nextAttemptAt, now + (long)RetryInterval.TotalMilliseconds);
                _snapshot = snapshot;
                return snapshot;
            }
        }
    }
}
