using System.Text;

namespace StaticHost.HybridApiDocs;

/// <summary>
/// Spreads pages across the private renderers by a stable hash of the upstream URL, so each worker
/// keeps its own half of the native cache warm. A failed endpoint is skipped for a short cooldown,
/// but stays available as a last resort so a total outage can still recover.
/// </summary>
internal sealed class HybridApiDocsEndpointPool(Uri[] endpoints)
{
    internal static readonly TimeSpan Cooldown = TimeSpan.FromSeconds(10);
    private readonly long[] _unavailableUntil = new long[endpoints.Length];

    internal static int PreferredIndex(string key, int count)
    {
        var hash = 2166136261u;
        unchecked
        {
            foreach (var value in Encoding.UTF8.GetBytes(key)) hash = (hash ^ value) * 16777619u;
        }
        return (int)(hash % (uint)count);
    }

    public IEnumerable<(int Index, Uri Address)> Candidates(string key)
    {
        var first = PreferredIndex(key, endpoints.Length);
        var now = Environment.TickCount64;
        var ordered = Enumerable.Range(0, endpoints.Length).Select(offset => (first + offset) % endpoints.Length).ToArray();
        foreach (var index in ordered.Where(index => Volatile.Read(ref _unavailableUntil[index]) <= now))
            yield return (index, endpoints[index]);
        foreach (var index in ordered.Where(index => Volatile.Read(ref _unavailableUntil[index]) > now))
            yield return (index, endpoints[index]);
    }

    public void MarkFailed(int index)
        => Volatile.Write(ref _unavailableUntil[index], Environment.TickCount64 + (long)Cooldown.TotalMilliseconds);

    public void MarkHealthy(int index) => Volatile.Write(ref _unavailableUntil[index], 0);
}
