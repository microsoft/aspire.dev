using Microsoft.Extensions.FileProviders;

namespace StaticHost.AgentReadiness;

/// <summary>
/// Maps an HTTP request path to its sibling <c>.md</c> file in <c>wwwroot</c>,
/// matching the layout produced by <c>starlight-page-actions</c>:
/// <list type="bullet">
///   <item><description><c>/</c> → <c>/index.md</c></description></item>
///   <item><description><c>/foo/</c> → <c>/foo.md</c></description></item>
///   <item><description><c>/foo</c> → <c>/foo.md</c></description></item>
///   <item><description><c>/foo/bar/</c> → <c>/foo/bar.md</c></description></item>
///   <item><description><c>/foo.html</c> → <c>/foo.md</c></description></item>
/// </list>
/// Returns <see langword="null"/> when the path is infrastructure (e.g.
/// <c>/_astro/*</c>, <c>/.well-known/*</c>) or no companion file exists.
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
            return Try(fileProvider, "/index.md");
        }

        if (raw.EndsWith('/'))
        {
            return Try(fileProvider, $"{raw[..^1]}.md");
        }

        if (raw.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
        {
            return Try(fileProvider, raw[..^".html".Length] + ".md");
        }

        var dot = raw.LastIndexOf('.');
        var lastSlash = raw.LastIndexOf('/');
        if (dot <= lastSlash)
        {
            return Try(fileProvider, $"{raw}.md");
        }

        return null;
    }

    private static string? Try(IFileProvider provider, string relativePath)
    {
        var info = provider.GetFileInfo(relativePath);
        return info.Exists && !info.IsDirectory ? relativePath : null;
    }
}
