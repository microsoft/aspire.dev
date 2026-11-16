using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;
using Microsoft.Net.Http.Headers;

namespace StaticHost.SiteFiles;

/// <summary>
/// Serves the site's files from the web root, with the brotli copy the publish wrote next to a
/// file (<c>page.html.br</c>) when the client accepts it.
/// </summary>
/// <remarks>
/// <para>
/// This replaces <c>MapStaticAssets</c>, which reads a manifest of every file at startup and builds
/// a route for each one. With about 70,000 files, that manifest took a minute of every build and
/// publish, and each instance seconds and gigabytes of memory to start. This middleware keeps no
/// per-file state up front: it looks the file up on each request, as <c>UseStaticFiles</c> does,
/// and computes the ETag the first time a file is served (<see cref="SiteFileETags"/>).
/// </para>
/// <para>
/// It runs after <c>UseRouting</c> and steps aside when an endpoint matched, so the API, health
/// and download endpoints keep precedence over a file of the same path, as they had over the
/// static asset endpoints.
/// </para>
/// <para>
/// A request for one byte range gets it (video players need ranges); other range requests get the
/// whole file.
/// </para>
/// </remarks>
internal sealed class SiteFileMiddleware
{
    // Images, video and fonts get the SDK's default media caching, as with MapStaticAssets.
    internal const string MediaCacheControl = "max-age=3600, must-revalidate";

    // Astro hashes the names of the files it emits under /_astro/, so they can be cached forever.
    // https://starlight.astro.build/environmental-impact/#caching
    internal const string ImmutableCacheControl = "max-age=31536000, public, immutable";

    internal const string DefaultCacheControl = "no-cache";

    private const string BrotliExtension = ".br";

    private const string UnknownContentType = "application/octet-stream";

    private static readonly PathString s_immutablePrefix = "/_astro";

    private readonly RequestDelegate _next;
    private readonly IFileProvider _fileProvider;
    private readonly SiteFileETags _etags;
    private readonly FileExtensionContentTypeProvider _contentTypes;

    public SiteFileMiddleware(RequestDelegate next, IWebHostEnvironment environment, SiteFileETags etags)
    {
        _next = next;
        _fileProvider = environment.WebRootFileProvider;
        _etags = etags;
        _contentTypes = CreateContentTypeProvider();
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var request = context.Request;
        if (context.GetEndpoint() is not null
            || !(HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method))
            || !request.Path.HasValue
            || request.Path.Value.EndsWith('/'))
        {
            await _next(context);
            return;
        }

        var file = _fileProvider.GetFileInfo(request.Path.Value);
        if (!file.Exists || file.IsDirectory)
        {
            await _next(context);
            return;
        }

        // Every file the site emits is meant to be served, including types this provider does
        // not know (Pagefind's index, asciinema casts), as MapStaticAssets did.
        if (!_contentTypes.TryGetContentType(request.Path.Value, out var contentType))
        {
            contentType = UnknownContentType;
        }

        var compressed = _fileProvider.GetFileInfo(request.Path.Value + BrotliExtension);
        var hasCompressed = compressed.Exists && !compressed.IsDirectory;
        var useCompressed = hasCompressed && AcceptsBrotli(request.Headers.AcceptEncoding);
        var served = useCompressed ? compressed : file;

        var response = context.Response;
        var etag = await _etags.GetAsync(served, context.RequestAborted);
        var lastModified = TruncateToSeconds(file.LastModified);

        var headers = response.Headers;
        headers.CacheControl = GetCacheControl(request.Path, contentType);
        headers.ETag = etag;
        headers.LastModified = HeaderUtilities.FormatDate(lastModified);
        if (hasCompressed)
        {
            headers.Vary = HeaderNames.AcceptEncoding;
        }

        if (IsNotModified(request, etag, lastModified))
        {
            response.StatusCode = StatusCodes.Status304NotModified;
            return;
        }

        headers.AcceptRanges = "bytes";
        var range = GetRange(request, etag, lastModified, served.Length, out var unsatisfiable);
        if (unsatisfiable)
        {
            response.StatusCode = StatusCodes.Status416RangeNotSatisfiable;
            headers.ContentRange = $"bytes */{served.Length}";
            return;
        }

        response.ContentType = contentType;
        if (useCompressed)
        {
            headers.ContentEncoding = "br";
        }

        var (offset, count) = range ?? (0, served.Length);
        if (range is not null)
        {
            response.StatusCode = StatusCodes.Status206PartialContent;
            headers.ContentRange = $"bytes {offset}-{offset + count - 1}/{served.Length}";
        }
        else
        {
            response.StatusCode = StatusCodes.Status200OK;
        }

        response.ContentLength = count;
        if (HttpMethods.IsHead(request.Method))
        {
            return;
        }

        await response.SendFileAsync(served, offset, count, context.RequestAborted);
    }

    internal static string GetCacheControl(PathString path, string contentType)
    {
        if (path.StartsWithSegments(s_immutablePrefix, StringComparison.Ordinal))
        {
            return ImmutableCacheControl;
        }

        return contentType.StartsWith("image/", StringComparison.Ordinal)
            || contentType.StartsWith("video/", StringComparison.Ordinal)
            || contentType.StartsWith("font/", StringComparison.Ordinal)
            ? MediaCacheControl
            : DefaultCacheControl;
    }

    internal static bool AcceptsBrotli(StringValues acceptEncoding)
    {
        if (!StringWithQualityHeaderValue.TryParseList(acceptEncoding, out var encodings))
        {
            return false;
        }

        double? brotli = null;
        double? wildcard = null;
        foreach (var encoding in encodings)
        {
            var quality = encoding.Quality ?? 1;
            if (StringSegment.Equals(encoding.Value, "br", StringComparison.OrdinalIgnoreCase))
            {
                brotli = quality;
            }
            else if (StringSegment.Equals(encoding.Value, "*", StringComparison.Ordinal))
            {
                wildcard = quality;
            }
        }

        // An explicit "br;q=0" refuses brotli even when "*" accepts everything else.
        return (brotli ?? wildcard ?? 0) > 0;
    }

    private static bool IsNotModified(HttpRequest request, string etag, DateTimeOffset lastModified)
    {
        var requestHeaders = request.GetTypedHeaders();

        // If-None-Match takes precedence over If-Modified-Since (RFC 9110, 13.1.3).
        var ifNoneMatch = requestHeaders.IfNoneMatch;
        if (ifNoneMatch.Count > 0)
        {
            var current = EntityTagHeaderValue.Parse(etag);
            foreach (var candidate in ifNoneMatch)
            {
                if (candidate.Equals(EntityTagHeaderValue.Any) || candidate.Compare(current, useStrongComparison: false))
                {
                    return true;
                }
            }

            return false;
        }

        return requestHeaders.IfModifiedSince is { } ifModifiedSince && lastModified <= ifModifiedSince;
    }

    /// <summary>
    /// Returns the single byte range to send, or <see langword="null"/> to send the whole file,
    /// which a server may do for any range request it does not support, such as several ranges.
    /// Safari only plays video from servers that answer ranges.
    /// </summary>
    private static (long Offset, long Count)? GetRange(
        HttpRequest request, string etag, DateTimeOffset lastModified, long length, out bool unsatisfiable)
    {
        unsatisfiable = false;
        var requestHeaders = request.GetTypedHeaders();
        var range = requestHeaders.Range;
        if (range is null
            || !StringSegment.Equals(range.Unit, "bytes", StringComparison.OrdinalIgnoreCase)
            || range.Ranges.Count != 1)
        {
            return null;
        }

        // If-Range applies the range only to the representation the client has (RFC 9110, 13.1.5).
        if (requestHeaders.IfRange is { } ifRange)
        {
            var matches = ifRange.EntityTag is { } tag
                ? tag.Compare(EntityTagHeaderValue.Parse(etag), useStrongComparison: true)
                : ifRange.LastModified == lastModified;
            if (!matches)
            {
                return null;
            }
        }

        var item = range.Ranges.First();
        long start, end;
        if (item.From is { } from)
        {
            start = from;
            end = Math.Min(item.To ?? long.MaxValue, length - 1);
        }
        else
        {
            // A suffix range: the last N bytes.
            start = Math.Max(0, length - (item.To ?? 0));
            end = length - 1;
        }

        if (start >= length || start > end)
        {
            unsatisfiable = true;
            return null;
        }

        return (start, end - start + 1);
    }

    private static DateTimeOffset TruncateToSeconds(DateTimeOffset value) =>
        new(value.Year, value.Month, value.Day, value.Hour, value.Minute, value.Second, value.Offset);

    private static FileExtensionContentTypeProvider CreateContentTypeProvider()
    {
        var provider = new FileExtensionContentTypeProvider();

        // The SDK's static web assets mapping, which production sent until now, differs here.
        provider.Mappings[".md"] = "text/markdown";

        return provider;
    }
}
