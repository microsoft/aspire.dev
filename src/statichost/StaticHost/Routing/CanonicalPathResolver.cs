namespace StaticHost.Routing;

internal sealed class CanonicalPathResolver(IEnumerable<string> canonicalPaths)
{
    private static readonly HashSet<string> DefaultFileNames =
    [
        "default.htm",
        "default.html",
        "index.htm",
        "index.html",
    ];

    private static readonly EnumerationOptions StaticFileEnumerationOptions = new()
    {
        AttributesToSkip = FileAttributes.ReparsePoint,
        RecurseSubdirectories = true,
    };

    private readonly Dictionary<string, string?> _canonicalPaths = CreateLookup(canonicalPaths);

    public CanonicalPathResolver(string webRootPath)
        : this(EnumerateCanonicalPaths(webRootPath))
    {
    }

    public bool TryResolve(PathString requestPath, out PathString canonicalPath)
    {
        canonicalPath = default;

        var requestedPath = requestPath.Value;
        if (requestedPath is null ||
            !_canonicalPaths.TryGetValue(requestedPath, out var resolvedPath) ||
            resolvedPath is null ||
            string.Equals(requestedPath, resolvedPath, StringComparison.Ordinal))
        {
            return false;
        }

        canonicalPath = new PathString(resolvedPath);
        return true;
    }

    private static Dictionary<string, string?> CreateLookup(
        IEnumerable<string> canonicalPaths)
    {
        ArgumentNullException.ThrowIfNull(canonicalPaths);

        var lookup = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var canonicalPath in canonicalPaths)
        {
            if (string.IsNullOrEmpty(canonicalPath) || canonicalPath[0] != '/')
            {
                throw new ArgumentException(
                    "Canonical paths must be non-empty and start with '/'.",
                    nameof(canonicalPaths));
            }

            if (!lookup.TryGetValue(canonicalPath, out var existingPath))
            {
                lookup.Add(canonicalPath, canonicalPath);
            }
            else if (existingPath is not null &&
                     !string.Equals(existingPath, canonicalPath, StringComparison.Ordinal))
            {
                // A case-insensitive request cannot uniquely identify either path.
                lookup[canonicalPath] = null;
            }
        }

        return lookup;
    }

    private static IEnumerable<string> EnumerateCanonicalPaths(string webRootPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(webRootPath);
        if (!Directory.Exists(webRootPath))
        {
            throw new DirectoryNotFoundException(
                $"The static web root '{webRootPath}' does not exist.");
        }

        // Enumerate the physical root so dot-prefixed paths such as /.well-known/
        // are included; some IFileProvider implementations hide them from listings.
        foreach (var filePath in Directory.EnumerateFiles(
            webRootPath,
            "*",
            StaticFileEnumerationOptions))
        {
            var relativePath = Path.GetRelativePath(webRootPath, filePath)
                .Replace(Path.DirectorySeparatorChar, '/');
            var requestPath = $"/{relativePath}";

            yield return requestPath;

            if (!DefaultFileNames.Contains(Path.GetFileName(relativePath)))
            {
                continue;
            }

            var relativeDirectory = Path.GetDirectoryName(relativePath)?
                .Replace(Path.DirectorySeparatorChar, '/');
            var directoryRequestPath = string.IsNullOrEmpty(relativeDirectory)
                ? "/"
                : $"/{relativeDirectory}";

            yield return directoryRequestPath;
            if (directoryRequestPath != "/")
            {
                yield return $"{directoryRequestPath}/";
            }
        }
    }
}
