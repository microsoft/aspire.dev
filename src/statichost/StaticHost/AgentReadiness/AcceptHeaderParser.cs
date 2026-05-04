namespace StaticHost.AgentReadiness;

/// <summary>
/// Parses HTTP <c>Accept</c> header values into ranked media types and answers
/// targeted questions like "does the client prefer markdown over HTML?".
/// </summary>
/// <remarks>
/// Implements a small subset of RFC 9110 §12.5.1 sufficient for content
/// negotiation between <c>text/html</c> and <c>text/markdown</c>. We intentionally
/// avoid pulling in <c>Microsoft.Net.Http.Headers</c>'s full parser because we
/// need a deterministic, testable predicate that knows about q-values, the
/// <c>*/*</c> wildcard, and parameter-laden values like
/// <c>text/markdown;profile=&quot;cmark&quot;;q=0.9</c>.
/// </remarks>
internal static class AcceptHeaderParser
{
    private const double DefaultQuality = 1.0;

    internal readonly record struct MediaTypeWithQ(string Type, string Subtype, double Quality)
    {
        public bool Matches(string type, string subtype) =>
            (Type == "*" || string.Equals(Type, type, StringComparison.OrdinalIgnoreCase)) &&
            (Subtype == "*" || string.Equals(Subtype, subtype, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Parses the supplied Accept header value into a list of media types with
    /// q-values. Returns an empty list when the header is null/empty.
    /// </summary>
    public static IReadOnlyList<MediaTypeWithQ> Parse(string? acceptHeader)
    {
        if (string.IsNullOrWhiteSpace(acceptHeader))
        {
            return Array.Empty<MediaTypeWithQ>();
        }

        var results = new List<MediaTypeWithQ>();
        foreach (var rawSegment in acceptHeader.Split(','))
        {
            var segment = rawSegment.Trim();
            if (segment.Length == 0)
            {
                continue;
            }

            var parts = segment.Split(';');
            var mediaType = parts[0].Trim();
            var slash = mediaType.IndexOf('/');
            if (slash <= 0 || slash == mediaType.Length - 1)
            {
                continue;
            }

            var type = mediaType[..slash];
            var subtype = mediaType[(slash + 1)..];
            var q = DefaultQuality;
            for (var i = 1; i < parts.Length; i++)
            {
                var param = parts[i].Trim();
                if (param.StartsWith("q=", StringComparison.OrdinalIgnoreCase) &&
                    double.TryParse(
                        param.AsSpan(2),
                        System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture,
                        out var parsed))
                {
                    q = Math.Clamp(parsed, 0.0, 1.0);
                    break;
                }
            }

            results.Add(new MediaTypeWithQ(type, subtype, q));
        }

        return results;
    }

    /// <summary>
    /// Returns the highest q-value across entries that match the given
    /// <paramref name="type"/>/<paramref name="subtype"/>, including wildcards.
    /// Returns 0.0 when no entry matches (i.e. the type is not acceptable).
    /// </summary>
    public static double QualityFor(IReadOnlyList<MediaTypeWithQ> ranked, string type, string subtype)
    {
        var best = 0.0;
        foreach (var entry in ranked)
        {
            if (entry.Matches(type, subtype) && entry.Quality > best)
            {
                best = entry.Quality;
            }
        }
        return best;
    }

    /// <summary>
    /// True when the client prefers <c>text/markdown</c> strictly over both
    /// <c>text/html</c> and <c>* / *</c>. <c>* / *</c> alone (a generic Accept)
    /// is NOT a markdown preference.
    /// </summary>
    public static bool PrefersMarkdown(string? acceptHeader)
    {
        var ranked = Parse(acceptHeader);
        if (ranked.Count == 0)
        {
            return false;
        }

        // Wildcards cannot express markdown preference (a request with only "*/*"
        // should get HTML), so we look only at explicit text/markdown entries.
        var markdownQ = HighestExplicitQuality(ranked, "text", "markdown");
        if (markdownQ <= 0.0)
        {
            return false;
        }

        // For HTML we count any acceptable representation, including wildcards
        // like "*/*" or "text/*", because those make HTML a viable response.
        var anyHtmlQ = QualityFor(ranked, "text", "html");

        // Strictly prefer markdown when it beats any acceptable HTML representation,
        // OR when HTML is not acceptable at all (markdownQ > 0 and htmlQ == 0).
        return anyHtmlQ <= 0.0 || markdownQ > anyHtmlQ;
    }

    /// <summary>
    /// Highest q-value across entries that match <paramref name="type"/>/<paramref name="subtype"/>
    /// exactly (no wildcards). Returns 0.0 when no explicit entry matches.
    /// </summary>
    private static double HighestExplicitQuality(IReadOnlyList<MediaTypeWithQ> ranked, string type, string subtype)
    {
        var best = 0.0;
        foreach (var entry in ranked)
        {
            if (string.Equals(entry.Type, type, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(entry.Subtype, subtype, StringComparison.OrdinalIgnoreCase) &&
                entry.Quality > best)
            {
                best = entry.Quality;
            }
        }
        return best;
    }

    /// <summary>
    /// True when an HTML response would still be acceptable to the client
    /// (either via an explicit text/html entry, text/* wildcard, or */*).
    /// Used when we can't satisfy a markdown preference and want to know
    /// whether falling back to HTML is OK or whether 406 is the right answer.
    /// </summary>
    public static bool AcceptsHtml(string? acceptHeader)
    {
        var ranked = Parse(acceptHeader);
        if (ranked.Count == 0)
        {
            return true;
        }
        return QualityFor(ranked, "text", "html") > 0.0;
    }
}
