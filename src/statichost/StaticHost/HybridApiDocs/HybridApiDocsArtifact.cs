using System.Text.Json;
using System.Text.RegularExpressions;

namespace StaticHost.HybridApiDocs;

internal sealed record HybridApiRoute(string? Html, string Markdown);
internal sealed record HybridRedirect(string Path, string Destination, int Status);
internal sealed record HybridApiManifest(
    int SchemaVersion, string Mode, string BuildId, string Client, string Server,
    string Site, HybridApiRoute[] Routes, HybridRedirect[] Redirects, string Platform);

internal sealed class HybridApiDocsArtifact
{
    private readonly Dictionary<string, string> _canonical = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, HybridApiRoute> _routes = new(StringComparer.Ordinal);
    private readonly Dictionary<string, HybridRedirect> _redirects = new(StringComparer.Ordinal);
    private readonly HashSet<string> _images = new(StringComparer.Ordinal);

    public HybridApiManifest Manifest { get; }
    public string ClientDirectory { get; }
    public Uri Site { get; }

    private HybridApiDocsArtifact(string path, HybridApiManifest manifest)
    {
        Manifest = manifest;
        if (manifest.SchemaVersion != 1 || manifest.Mode != "hybrid-api-docs" ||
            !Regex.IsMatch(manifest.BuildId ?? "", "^[a-f0-9]{64}$") ||
            manifest.Routes is null || manifest.Redirects is null ||
            manifest.Platform != (OperatingSystem.IsWindows() ? "win32" : OperatingSystem.IsMacOS() ? "darwin" : "linux") ||
            !Uri.TryCreate(manifest.Site, UriKind.Absolute, out var site) ||
            site.Scheme is not ("http" or "https"))
        {
            throw new InvalidOperationException("Incompatible hybrid API documentation manifest.");
        }
        Site = site;
        var root = Path.GetDirectoryName(Path.GetFullPath(path))!;
        ClientDirectory = ResolveArtifactPath(root, manifest.Client);
        if (!Directory.Exists(ClientDirectory))
        {
            throw new InvalidOperationException("The selected hybrid client directory does not exist.");
        }
        foreach (var route in manifest.Routes)
        {
            if (route.Html is not null)
            {
                AddRoute(route.Html, route);
                _canonical.TryAdd(route.Html.TrimEnd('/'), route.Html);
                _canonical.TryAdd(route.Html + "index.html", route.Html);
            }
            AddRoute(route.Markdown, route);
            _canonical.TryAdd(route.Markdown + "/", route.Markdown);
        }
        foreach (var redirect in manifest.Redirects)
        {
            ValidatePath(redirect.Path);
            ValidatePath(redirect.Destination);
            if (redirect.Status is not (301 or 302 or 303 or 307 or 308))
                throw new InvalidOperationException("Invalid hybrid redirect status.");
            _redirects.Add(redirect.Path, redirect);
            _canonical.TryAdd(redirect.Path, redirect.Path);
            _canonical.TryAdd(redirect.Path.TrimEnd('/'), redirect.Path);
        }
        var assets = Path.Combine(ClientDirectory, "_astro");
        if (Directory.Exists(assets))
        {
            foreach (var image in Directory.EnumerateFiles(assets, "*", new EnumerationOptions
            {
                RecurseSubdirectories = true,
                AttributesToSkip = FileAttributes.ReparsePoint,
            }))
            {
                if (Path.GetExtension(image).ToLowerInvariant() is ".svg" or ".png" or ".jpg" or ".jpeg" or ".webp" or ".avif" or ".gif")
                    _images.Add("/" + Path.GetRelativePath(ClientDirectory, image).Replace(Path.DirectorySeparatorChar, '/'));
            }
        }
    }

    public static HybridApiDocsArtifact Load(string path)
    {
        if (!File.Exists(path))
            throw new InvalidOperationException($"Build the hybrid website with 'pnpm build' in src/frontend, or download the CI artifact, before starting StaticHost: {path}");
        var manifest = JsonSerializer.Deserialize<HybridApiManifest>(
            File.ReadAllText(path), new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("Empty hybrid API documentation manifest.");
        return new HybridApiDocsArtifact(path, manifest);
    }

    public bool TryCanonical(string path, out string? canonical) => _canonical.TryGetValue(path, out canonical);
    public bool TryRoute(string path, out HybridApiRoute? route) => _routes.TryGetValue(path, out route);
    public bool TryRedirect(string path, out HybridRedirect? redirect) => _redirects.TryGetValue(path, out redirect);
    public bool IsLocalImage(string path) => _images.Contains(path);

    private void AddRoute(string path, HybridApiRoute route)
    {
        ValidatePath(path);
        if (!path.StartsWith("/reference/api/", StringComparison.Ordinal) ||
            !(path.EndsWith('/') || path.EndsWith(".md", StringComparison.Ordinal)))
            throw new InvalidOperationException($"Invalid API catalogue path: {path}");
        _routes.Add(path, route);
        _canonical.TryAdd(path, path);
    }

    private static void ValidatePath(string path)
    {
        if (string.IsNullOrEmpty(path) || !path.StartsWith('/') || path.StartsWith("//") ||
            path.Contains('\\') || path.Contains('#') || path.Contains('?') ||
            path.Split('/').Any(segment => segment is "." or ".."))
            throw new InvalidOperationException($"Invalid hybrid artifact URL path: {path}");
    }

    private static string ResolveArtifactPath(string root, string path)
    {
        if (string.IsNullOrWhiteSpace(path) || Path.IsPathRooted(path))
            throw new InvalidOperationException("Hybrid artifact paths must be relative.");
        var full = Path.GetFullPath(Path.Combine(root, path));
        if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Hybrid artifact path escapes its root.");
        return full;
    }
}
