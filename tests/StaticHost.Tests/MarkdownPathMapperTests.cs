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
    [InlineData("/", "/index.html", "/index.md")]
    [InlineData("/get-started/", "/get-started/index.html", "/get-started.md")]
    [InlineData("/get-started", "/get-started/index.html", "/get-started.md")]
    [InlineData("/get-started/quickstart/", "/get-started/quickstart/index.html", "/get-started/quickstart.md")]
    [InlineData("/get-started.html", "/get-started.html", "/get-started.md")]
    public void Maps_to_expected_companion_when_html_and_md_both_exist(string requestPath, string htmlSibling, string expectedMd)
    {
        var provider = new StubFileProvider([htmlSibling, expectedMd]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString(requestPath), provider);
        Assert.Equal(expectedMd, actual);
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
        var provider = new StubFileProvider([$"{requestPath}.md", "/index.md", "/index.html"]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString(requestPath), provider);
        Assert.Null(actual);
    }

    [Fact]
    public void Returns_null_when_no_companion_exists()
    {
        var provider = new StubFileProvider(["/get-started/index.html"]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString("/get-started/"), provider);
        Assert.Null(actual);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/stray/")]
    [InlineData("/stray")]
    [InlineData("/stray.html")]
    public void Returns_null_when_md_exists_but_html_sibling_does_not(string requestPath)
    {
        // A stray .md without a real HTML page MUST NOT be advertised or served as
        // a companion. Not all pages on the site emit a .md; only those that also
        // have a Starlight-generated HTML page are eligible.
        var provider = new StubFileProvider(["/index.md", "/stray.md"]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString(requestPath), provider);
        Assert.Null(actual);
    }

    [Fact]
    public void Skips_paths_with_unhandled_extensions()
    {
        var provider = new StubFileProvider(["/data.json.md", "/data.json"]);
        var actual = MarkdownPathMapper.TryGetMarkdownCompanion(new PathString("/data.json"), provider);
        Assert.Null(actual);
    }
}
