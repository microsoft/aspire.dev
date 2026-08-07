using System.Globalization;
using Microsoft.Extensions.Caching.Memory;

namespace StaticHost.AgentReadiness;

/// <summary>
/// Parses HTTP <c>Accept</c> header values into negotiation decisions between
/// <c>text/html</c> and <c>text/markdown</c> (the only two representations
/// this site negotiates between).
/// </summary>
/// <remarks>
/// <para>
/// Implements a small subset of RFC 9110 §12.5.1 sufficient for content
/// negotiation between <c>text/html</c> and <c>text/markdown</c>. We intentionally
/// avoid pulling in <c>Microsoft.Net.Http.Headers</c>'s full parser because we
/// need a deterministic, testable predicate that knows about q-values, the
/// <c>*/*</c> wildcard, and parameter-laden values like
/// <c>text/markdown;profile=&quot;cmark&quot;;q=0.9</c>.
/// </para>
/// <para>
/// This runs in middleware on every request, so the implementation is
/// non-allocating (span-based; no <c>string.Split</c>, no intermediate lists)
/// and memoizes outcomes in a bounded <see cref="MemoryCache"/>. Real-world
/// Accept headers are dominated by a small set of distinct values (a handful
/// of browsers plus a few agents), so cache hits are the common case;
/// <c>SizeLimit</c> bounds memory in pathological/adversarial cases.
/// </para>
/// </remarks>
internal static class AcceptHeaderParser
{
    // Each cache entry is registered with Size = 1, so SizeLimit caps the
    // number of distinct Accept headers we'll memoize. 256 comfortably covers
    // the long tail of real-world headers (browsers + agents + a few outliers).
    private const int MaxCacheEntries = 256;

    // Headers larger than this are not memoized at all — bounds worst-case key
    // memory and avoids ever caching obviously-pathological inputs.
    private const int MaxCacheKeyLength = 256;

    private static readonly MemoryCache s_cache = new(new MemoryCacheOptions
    {
        SizeLimit = MaxCacheEntries,
    });

    /// <summary>
    /// The negotiation outcome for an Accept header.
    /// </summary>
    internal readonly record struct NegotiationResult(bool PrefersMarkdown, bool AcceptsHtml)
    {
        // No (or whitespace-only) Accept header means "send me anything sensible":
        // HTML is acceptable, markdown is not preferred.
        public static NegotiationResult Default { get; } = new(PrefersMarkdown: false, AcceptsHtml: true);
    }

    /// <summary>
    /// Computes the <see cref="NegotiationResult"/> for an Accept header,
    /// returning a memoized result for repeat headers.
    /// </summary>
    public static NegotiationResult Negotiate(string? acceptHeader)
    {
        if (string.IsNullOrWhiteSpace(acceptHeader))
        {
            return NegotiationResult.Default;
        }

        if (s_cache.TryGetValue(acceptHeader, out NegotiationResult cached))
        {
            return cached;
        }

        var result = NegotiateCore(acceptHeader.AsSpan());

        if (acceptHeader.Length <= MaxCacheKeyLength)
        {
            // Size = 1 per entry; MemoryCache enforces SizeLimit by compacting
            // (evicting older/lower-priority entries) when the sum is exceeded.
            using var entry = s_cache.CreateEntry(acceptHeader);
            entry.Value = result;
            entry.Size = 1;
        }

        return result;
    }

    /// <summary>
    /// True when the client prefers <c>text/markdown</c> strictly over both
    /// <c>text/html</c> and <c>*/*</c>. A plain <c>*/*</c> (a generic Accept)
    /// is NOT a markdown preference.
    /// </summary>
    public static bool PrefersMarkdown(string? acceptHeader) => Negotiate(acceptHeader).PrefersMarkdown;

    /// <summary>
    /// True when an HTML response would still be acceptable to the client
    /// (via an explicit <c>text/html</c> entry, a <c>text/*</c> wildcard, or
    /// <c>*/*</c>). Used when we can't satisfy a markdown preference and want
    /// to know whether falling back to HTML is OK or whether 406 is the right
    /// answer.
    /// </summary>
    public static bool AcceptsHtml(string? acceptHeader) => Negotiate(acceptHeader).AcceptsHtml;

    private static NegotiationResult NegotiateCore(ReadOnlySpan<char> acceptHeader)
    {
        // Best q-value seen for explicit text/markdown.
        var markdownQ = 0.0;
        // Best q-value seen for any media range that admits text/html
        // (explicit text/html, text/*, or */*).
        var htmlQ = 0.0;
        var sawAnyEntry = false;

        foreach (var commaRange in acceptHeader.Split(','))
        {
            var entry = acceptHeader[commaRange].Trim();
            if (entry.IsEmpty)
            {
                continue;
            }

            // Split media type from parameters at the first ';'.
            ReadOnlySpan<char> mediaType;
            ReadOnlySpan<char> paramsSpan;
            var semicolon = entry.IndexOf(';');
            if (semicolon < 0)
            {
                mediaType = entry;
                paramsSpan = default;
            }
            else
            {
                mediaType = entry[..semicolon].TrimEnd();
                paramsSpan = entry[(semicolon + 1)..];
            }

            var slash = mediaType.IndexOf('/');
            if (slash <= 0 || slash == mediaType.Length - 1)
            {
                continue;
            }

            var type = mediaType[..slash];
            var subtype = mediaType[(slash + 1)..];

            var q = ParseQuality(paramsSpan);

            sawAnyEntry = true;

            // text/markdown: explicit match only (no wildcards), per the
            // class contract — */* alone is not a markdown preference.
            if (q > markdownQ &&
                type.Equals("text", StringComparison.OrdinalIgnoreCase) &&
                subtype.Equals("markdown", StringComparison.OrdinalIgnoreCase))
            {
                markdownQ = q;
            }

            // text/html: explicit, text/*, or */* all qualify as "HTML is OK".
            if (q > htmlQ && MatchesHtml(type, subtype))
            {
                htmlQ = q;
            }
        }

        if (!sawAnyEntry)
        {
            // Header parsed to nothing usable (e.g. ", , ,").
            return NegotiationResult.Default;
        }

        var prefersMarkdown = markdownQ > 0.0 && (htmlQ <= 0.0 || markdownQ > htmlQ);
        var acceptsHtml = htmlQ > 0.0;
        return new NegotiationResult(prefersMarkdown, acceptsHtml);
    }

    private static double ParseQuality(ReadOnlySpan<char> paramsSpan)
    {
        if (paramsSpan.IsEmpty)
        {
            return 1.0;
        }

        foreach (var paramRange in paramsSpan.Split(';'))
        {
            var p = paramsSpan[paramRange].Trim();
            if (p.Length < 2 || p[1] != '=' || (p[0] != 'q' && p[0] != 'Q'))
            {
                continue;
            }

            if (double.TryParse(
                    p[2..],
                    NumberStyles.Float,
                    CultureInfo.InvariantCulture,
                    out var parsed))
            {
                return Math.Clamp(parsed, 0.0, 1.0);
            }

            // First "q=" wins (RFC 9110 §12.4.2); a malformed value falls back
            // to the default rather than searching further into other params.
            break;
        }

        return 1.0;
    }

    private static bool MatchesHtml(ReadOnlySpan<char> type, ReadOnlySpan<char> subtype)
    {
        var typeOk = (type.Length == 1 && type[0] == '*') ||
                     type.Equals("text", StringComparison.OrdinalIgnoreCase);
        if (!typeOk)
        {
            return false;
        }

        return (subtype.Length == 1 && subtype[0] == '*') ||
               subtype.Equals("html", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Test-only hook to reset the memoization cache so cache-aware tests can
    /// observe the parse path on a clean slate.
    /// </summary>
    internal static void ClearCacheForTests() => s_cache.Clear();
}
