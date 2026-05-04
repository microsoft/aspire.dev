using StaticHost.AgentReadiness;
using Microsoft.Extensions.FileProviders;

namespace StaticHost.Tests;

public sealed class MarkdownPathMapperTests
{
    private sealed class StubFileProvider : IFileProvider
    {
        private readonly HashSet<string> _files;

        public StubFileProvider(IEnumerable<string> files) =>
            _files = new HashSet<string>(files, StringComparer.OrdinalIgnoreCase);

        public IDirectoryContents GetDirectoryContents(string subpath) => NotFoundDirectoryContents.Singleton;

        public IFileInfo GetFileInfo(string subpath) =>
            _files.Contains(subpath) ? new StubFileInfo(subpath) : new NotFoundFileInfo(subpath);

        public Microsoft.Extensions.Primitives.IChangeToken Watch(string filter) => NeverChangeToken.Instance;
    }

    private sealed class NeverChangeToken : Microsoft.Extensions.Primitives.IChangeToken
    {
        public static readonly NeverChangeToken Instance = new();
        public bool HasChanged => false;
        public bool ActiveChangeCallbacks => false;
        public IDisposable RegisterChangeCallback(Action<object?> callback, object? state) => EmptyDisposable.Instance;

        private sealed class EmptyDisposable : IDisposable
        {
            public static readonly EmptyDisposable Instance = new();
            public void Dispose() { }
        }
    }

    private sealed class StubFileInfo : IFileInfo
    {
        public StubFileInfo(string name) => Name = name;

        public bool Exists => true;
        public long Length => 0;
        public string? PhysicalPath => null;
        public string Name { get; }
        public DateTimeOffset LastModified => DateTimeOffset.UnixEpoch;
        public bool IsDirectory => false;
        public Stream CreateReadStream() => new MemoryStream();
    }

    [Theory]
    [InlineData("/", "/index.md")]
    [InlineData("/get-started/", "/get-started.md")]
    [InlineData("/get-started", "/get-started.md")]
    [InlineData("/get-started/quickstart/", "/get-started/quickstart.md")]
    [InlineData("/get-started.html", "/get-started.md")]
    public void Maps_to_expected_companion_when_exists(string requestPath, string expected)
    {
        var provider = new StubFileProvider([expected]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString(requestPath), provider);
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData("/_astro/app.js")]
    [InlineData("/.well-known/agent-skills/index.json")]
    [InlineData("/healthz")]
    [InlineData("/install.ps1")]
    [InlineData("/install.sh")]
    [InlineData("/pagefind/pagefind.js")]
    public void Skips_infrastructure_paths(string requestPath)
    {
        // Even if the file system lies and a .md exists, infra paths must skip.
        var provider = new StubFileProvider([$"{requestPath}.md", "/index.md"]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString(requestPath), provider);
        Assert.Null(actual);
    }

    [Fact]
    public void Returns_null_when_no_companion_exists()
    {
        var provider = new StubFileProvider([]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString("/get-started/"), provider);
        Assert.Null(actual);
    }

    [Fact]
    public void Skips_paths_with_unhandled_extensions()
    {
        var provider = new StubFileProvider(["/data.json.md"]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString("/data.json"), provider);
        Assert.Null(actual);
    }
}
