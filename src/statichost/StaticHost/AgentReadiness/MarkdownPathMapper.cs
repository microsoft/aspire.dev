using Microsoft.Extensions.FileProviders;

namespace StaticHost.AgentReadiness;

/// <summary>
/// Maps an HTTP request path to its sibling <c>.md</c> file in <c>wwwroot</c>,
/// matching the layout produced by <c>starlight-page-actions</c>:
/// <list type="bullet">
///   <item><description><c>/</c> ↔ <c>/index.html</c> + <c>/index.md</c></description></item>
///   <item><description><c>/foo/</c> ↔ <c>/foo/index.html</c> + <c>/foo.md</c></description></item>
///   <item><description><c>/foo</c> ↔ <c>/foo/index.html</c> (or <c>/foo.html</c>) + <c>/foo.md</c></description></item>
///   <item><description><c>/foo/bar/</c> ↔ <c>/foo/bar/index.html</c> + <c>/foo/bar.md</c></description></item>
///   <item><description><c>/foo.html</c> ↔ <c>/foo.html</c> + <c>/foo.md</c></description></item>
/// </list>
/// <para>
/// A companion is only valid when <strong>both</strong> the <c>.md</c> and the
/// corresponding HTML page exist on disk. Not every page on aspire.dev produces
/// a <c>.md</c> companion (e.g. DocFX-rendered <c>/reference/api/**</c> pages,
/// the search page, Lunaria stats, redirects, the 404 page); requiring an HTML
/// sibling prevents us from advertising or serving a stray <c>.md</c> as the
/// companion of a URL that has no real HTML page.
/// </para>
/// <para>
/// Returns <see langword="null"/> when the path is infrastructure (e.g.
/// <c>/_astro/*</c>, <c>/.well-known/*</c>), when no <c>.md</c> exists, or
/// when no HTML sibling exists.
/// </para>
/// </summary>
internal static class MarkdownPathMapper
{
    public static bool IsInfrastructurePath(PathString path)
    {
        var raw = path.HasValue ? path.Value! : "/";
        return raw.StartsWith("/_astro/", StringComparison.OrdinalIgnoreCase) ||
               raw.StartsWith("/.well-known/", StringComparison.OrdinalIgnoreCase) ||
               raw.StartsWith("/healthz", StringComparison.OrdinalIgnoreCase) ||
               raw.StartsWith("/install.", StringComparison.OrdinalIgnoreCase) ||
               raw.StartsWith("/pagefind/", StringComparison.OrdinalIgnoreCase);
    }

    public static string? TryGetMarkdownCompanion(PathString path, IFileProvider fileProvider)
    {
        if (IsInfrastructurePath(path))
        {
            return null;
        }

        var raw = path.HasValue ? path.Value! : "/";

        if (raw == "/")
        {
            return CompanionIfBothExist(fileProvider, "/index.html", "/index.md");
        }

        if (raw.EndsWith('/'))
        {
            return CompanionIfBothExist(fileProvider, $"{raw}index.html", $"{raw[..^1]}.md");
        }

        if (raw.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
        {
            return CompanionIfBothExist(fileProvider, raw, raw[..^".html".Length] + ".md");
        }

        var dot = raw.LastIndexOf('.');
        var lastSlash = raw.LastIndexOf('/');
        if (dot <= lastSlash)
        {
            // Extensionless path like /foo. Static-file middleware may serve
            // either /foo/index.html (Starlight) or /foo.html. Either is enough
            // to anchor the companion mapping.
            var md = $"{raw}.md";
            if (!Exists(fileProvider, md))
            {
                return null;
            }
            if (Exists(fileProvider, $"{raw}/index.html") || Exists(fileProvider, $"{raw}.html"))
            {
                return md;
            }
        }

        return null;
    }

    private static string? CompanionIfBothExist(IFileProvider provider, string htmlPath, string mdPath) =>
        Exists(provider, htmlPath) && Exists(provider, mdPath) ? mdPath : null;

    private static bool Exists(IFileProvider provider, string relativePath)
    {
        var info = provider.GetFileInfo(relativePath);
        return info.Exists && !info.IsDirectory;
    }
}
