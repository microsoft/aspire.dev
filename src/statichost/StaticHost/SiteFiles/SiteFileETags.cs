using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.Extensions.FileProviders;

namespace StaticHost.SiteFiles;

/// <summary>
/// Computes a file's ETag from its SHA-256 the first time it is served, then keeps it in memory.
/// </summary>
/// <remarks>
/// The value is the base64 SHA-256 in quotes, which is what <c>MapStaticAssets</c> sent, so the
/// switch does not invalidate the copies browsers hold. A content hash, unlike the length and
/// last-modified time <c>UseStaticFiles</c> uses, stays the same across deployments for files
/// that did not change. An entry is recomputed when the file's length or last-modified time
/// changes, which covers a web root that is replaced while StaticHost runs (CI unpacks the site
/// after StaticHost starts).
/// </remarks>
internal sealed class SiteFileETags
{
    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    public int Count => _entries.Count;

    public async ValueTask<string> GetAsync(IFileInfo file, CancellationToken cancellationToken)
    {
        var key = file.PhysicalPath ?? file.Name;
        var length = file.Length;
        var lastModified = file.LastModified;

        if (_entries.TryGetValue(key, out var entry) && entry.Length == length && entry.LastModified == lastModified)
        {
            return entry.ETag;
        }

        // Two first requests for the same file may both hash it; the result is the same.
        await using var stream = file.CreateReadStream();
        var hash = await SHA256.HashDataAsync(stream, cancellationToken);
        var etag = $"\"{Convert.ToBase64String(hash)}\"";

        _entries[key] = new Entry(length, lastModified, etag);
        return etag;
    }

    private sealed record Entry(long Length, DateTimeOffset LastModified, string ETag);
}
