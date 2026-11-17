using System.Buffers;
using System.Collections.Concurrent;
using System.IO.Hashing;
using Microsoft.Extensions.FileProviders;

namespace StaticHost.SiteFiles;

/// <summary>
/// Computes a file's ETag from a hash of its content the first time it is served, then keeps it
/// in memory.
/// </summary>
/// <remarks>
/// The hash is XxHash128: an ETag only has to tell versions of a file apart, which needs no
/// cryptographic hash. A content hash, unlike the length and last-modified time
/// <c>UseStaticFiles</c> uses, stays the same across deployments for files that did not change,
/// though CI writes every file again. An entry is recomputed when the file's length or
/// last-modified time changes, which covers a web root that is replaced while StaticHost runs
/// (CI unpacks the site after StaticHost starts).
/// </remarks>
internal sealed class SiteFileETags
{
    private const int BufferSize = 64 * 1024;

    // Keyed by the file's physical path, which the provider normalizes: the request paths
    // /a/b.json, /a//b.json and /a///b.json are one file, so they share one entry, and the
    // dictionary holds at most one entry per file of the web root. Request paths would let any
    // client add entries without bound, each one costing a hash of the file.
    // Ordinal, as the file system is in production (Linux): two paths that differ only by case are
    // two files there, and must not share an entry. On a case-insensitive disk they are one file
    // under two keys, which costs one more hash. Canonical redirects send most requests to one casing.
    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    internal int Count => _entries.Count;

    /// <param name="path">
    /// The file's path in the web root, the key when the provider gives no physical path.
    /// </param>
    /// <param name="file">The file to hash.</param>
    /// <param name="cancellationToken">Cancels the hashing.</param>
    public async ValueTask<string> GetAsync(string path, IFileInfo file, CancellationToken cancellationToken)
    {
        var key = file.PhysicalPath ?? path;
        var length = file.Length;
        var lastModified = file.LastModified;

        if (_entries.TryGetValue(key, out var entry) && entry.Length == length && entry.LastModified == lastModified)
        {
            return entry.ETag;
        }

        // Two first requests for the same file may both hash it; the result is the same. That is
        // not worth coordinating: it happens once per file per instance, and sending the file
        // reads it anyway.
        var hash = new XxHash128();
        var buffer = ArrayPool<byte>.Shared.Rent(BufferSize);
        try
        {
            await using var stream = file.CreateReadStream();
            int read;
            while ((read = await stream.ReadAsync(buffer, cancellationToken)) > 0)
            {
                hash.Append(buffer.AsSpan(0, read));
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }

        var etag = $"\"{Convert.ToBase64String(hash.GetCurrentHash())}\"";
        _entries[key] = new Entry(length, lastModified, etag);
        return etag;
    }

    private sealed record Entry(long Length, DateTimeOffset LastModified, string ETag);
}
