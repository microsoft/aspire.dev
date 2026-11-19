using System.Text.Json;

namespace StaticHost.Routing;

internal enum LocaleFallbackAction
{
    None,
    Rewrite,
    Redirect,
}

internal readonly record struct LocaleFallbackResult(LocaleFallbackAction Action, string? Path)
{
    public static LocaleFallbackResult None { get; } = new(LocaleFallbackAction.None, null);
}

/// <summary>
/// Resolves untranslated locale routes (e.g. <c>/de/get-started/install-cli/</c>) to the
/// default-locale page that is served in place.
/// </summary>
/// <remarks>
/// The frontend build only emits locale pages that have a real translation. For any other
/// route under a known locale prefix, the default-locale file is served at the locale URL,
/// and client script localizes the site chrome. The locales come from
/// <c>/locale-fallback/locales.json</c>, which the frontend build emits from its locale config.
/// </remarks>
internal sealed class LocaleFallbackResolver
{
    public const string ManifestPath = "locale-fallback/locales.json";

    private readonly CanonicalPathResolver _paths;
    private readonly Dictionary<string, string> _locales;

    public LocaleFallbackResolver(CanonicalPathResolver paths, IEnumerable<string> locales)
    {
        ArgumentNullException.ThrowIfNull(paths);
        ArgumentNullException.ThrowIfNull(locales);

        _paths = paths;
        _locales = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var locale in locales)
        {
            if (!string.IsNullOrWhiteSpace(locale) && !locale.Contains('/'))
            {
                _locales.TryAdd(locale, locale);
            }
        }
    }

    public bool IsEnabled => _locales.Count > 0;

    public LocaleFallbackResult Resolve(PathString requestPath)
    {
        var path = requestPath.Value;
        if (!IsEnabled || string.IsNullOrEmpty(path) || path == "/")
        {
            return LocaleFallbackResult.None;
        }

        var segmentEnd = path.IndexOf('/', 1);
        var segment = segmentEnd < 0 ? path[1..] : path[1..segmentEnd];
        var unlocalizedPath = segmentEnd < 0 ? "/" : path[segmentEnd..];

        if (unlocalizedPath == "/" ||
            !_locales.TryGetValue(segment, out var locale) ||
            StartsWithLocale(unlocalizedPath) ||
            _paths.TryGetExistingPath(path, out _) ||
            !_paths.TryGetExistingPath(unlocalizedPath, out var defaultLocalePath))
        {
            return LocaleFallbackResult.None;
        }

        // Directory routes need a trailing slash; redirect within the locale rather than
        // letting the default-files middleware redirect to the unlocalized URL.
        if (!defaultLocalePath.EndsWith('/') &&
            _paths.TryGetExistingPath($"{defaultLocalePath}/", out var directoryPath))
        {
            return new(LocaleFallbackAction.Redirect, $"/{locale}{directoryPath}");
        }

        var localizedPath = $"/{locale}{defaultLocalePath}";
        return string.Equals(localizedPath, path, StringComparison.Ordinal)
            ? new(LocaleFallbackAction.Rewrite, defaultLocalePath)
            : new(LocaleFallbackAction.Redirect, localizedPath);
    }

    // `/de/ja/x/` must not serve the Japanese page as an English fallback for `de`.
    private bool StartsWithLocale(string path)
    {
        var end = path.IndexOf('/', 1);
        return _locales.ContainsKey(end < 0 ? path[1..] : path[1..end]);
    }

    public static IReadOnlyList<string> ReadLocales(string webRootPath)
    {
        var manifestPath = System.IO.Path.Combine(webRootPath, ManifestPath);
        if (!File.Exists(manifestPath))
        {
            return [];
        }

        using var stream = File.OpenRead(manifestPath);
        using var document = JsonDocument.Parse(stream);
        if (!document.RootElement.TryGetProperty("locales", out var locales) ||
            locales.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return [.. locales.EnumerateArray()
            .Where(static locale => locale.ValueKind == JsonValueKind.String)
            .Select(static locale => locale.GetString()!)];
    }
}
