namespace StaticHost.Routing;

internal sealed class CanonicalPathResolver
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

    private readonly Dictionary<string, string?> _canonicalPaths;

    public CanonicalPathResolver(string webRootPath)
        : this(EnumerateCanonicalPaths(webRootPath))
    {
    }

    internal CanonicalPathResolver(IEnumerable<string> canonicalPaths)
    {
        ArgumentNullException.ThrowIfNull(canonicalPaths);

        _canonicalPaths = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var canonicalPath in canonicalPaths)
        {
            if (string.IsNullOrEmpty(canonicalPath) || canonicalPath[0] != '/')
            {
                throw new ArgumentException(
                    "Canonical paths must be non-empty and start with '/'.",
                    nameof(canonicalPaths));
            }

            Add(canonicalPath);
        }
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

    private void Add(string canonicalPath)
    {
        if (!_canonicalPaths.TryGetValue(canonicalPath, out var existingPath))
        {
            _canonicalPaths.Add(canonicalPath, canonicalPath);
            return;
        }

        if (existingPath is not null &&
            !string.Equals(existingPath, canonicalPath, StringComparison.Ordinal))
        {
            // A case-insensitive request cannot uniquely identify either path.
            _canonicalPaths[canonicalPath] = null;
        }
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
