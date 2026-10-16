using System.Collections.Concurrent;

namespace StaticHost.HybridApiDocs;

internal sealed record HybridApiDocsResponse(
    int Status, KeyValuePair<string, string[]>[] Headers, byte[] Body, bool Unavailable, bool Cacheable)
{
    public string? CacheStatus => Headers.FirstOrDefault(header =>
        header.Key.Equals("X-Astro-Cache", StringComparison.OrdinalIgnoreCase)).Value?.FirstOrDefault();

    public static HybridApiDocsResponse Failure(int status) => new(status, [], [], true, false);
}

/// <summary>
/// The renderer client is transient, so identical in-flight renders are tracked here. One render per
/// URL is shared by every waiting request; a stampede on a cold page costs a single render.
/// </summary>
internal sealed class HybridApiDocsFlights
{
    public ConcurrentDictionary<string, Lazy<Task<HybridApiDocsResponse>>> Requests { get; } = new();
}
