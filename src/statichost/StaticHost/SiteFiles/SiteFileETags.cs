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

    // Ordinal, as the file system is in production (Linux): two paths that differ only by case are
    // two files there, and must not share an entry. On a case-insensitive disk they are one file
    // under two keys, which costs one more hash. Canonical redirects send most requests to one casing.
    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    /// <param name="path">The file's path in the web root, which identifies it whatever the provider.</param>
    /// <param name="file">The file to hash.</param>
    /// <param name="cancellationToken">Cancels the hashing.</param>
    public async ValueTask<string> GetAsync(string path, IFileInfo file, CancellationToken cancellationToken)
    {
        var length = file.Length;
        var lastModified = file.LastModified;

        if (_entries.TryGetValue(path, out var entry) && entry.Length == length && entry.LastModified == lastModified)
        {
            return entry.ETag;
        }

        // Two first requests for the same file may both hash it; the result is the same.
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
        _entries[path] = new Entry(length, lastModified, etag);
        return etag;
    }

    private sealed record Entry(long Length, DateTimeOffset LastModified, string ETag);
}
