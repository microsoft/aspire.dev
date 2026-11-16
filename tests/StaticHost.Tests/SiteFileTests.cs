using System.IO.Compression;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;
using StaticHost.SiteFiles;

namespace StaticHost.Tests;

public sealed class SiteFileTests
{
    private const string Page = "<!doctype html><html><body>" + "Hello, brotli. " + "</body></html>";

    [Fact]
    public async Task Serves_the_brotli_copy_when_the_client_accepts_it()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => SeedCompressedPage(root, "docs/page"));
        var compressed = await File.ReadAllBytesAsync(Path.Combine(server.WebRoot, "docs", "page", "index.html.br"));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/docs/page/");
        request.Headers.AcceptEncoding.ParseAdd("gzip, deflate, br");
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(["br"], response.Content.Headers.ContentEncoding);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(compressed.Length, response.Content.Headers.ContentLength);
        Assert.Contains("Accept-Encoding", response.Headers.Vary);
        Assert.Equal(compressed, await response.Content.ReadAsByteArrayAsync());
        Assert.Equal(ETagOf(compressed), response.Headers.ETag?.Tag);
    }

    [Fact]
    public async Task Serves_the_file_itself_when_the_client_does_not_accept_brotli()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => SeedCompressedPage(root, "docs/page"));

        using var response = await server.Client.GetAsync("/docs/page/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(response.Content.Headers.ContentEncoding);
        Assert.Contains("Accept-Encoding", response.Headers.Vary);
        Assert.Equal(Page, await response.Content.ReadAsStringAsync());
        Assert.Equal(ETagOf(Encoding.UTF8.GetBytes(Page)), response.Headers.ETag?.Tag);
    }

    [Fact]
    public async Task File_without_a_brotli_copy_has_no_vary_header()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("robots.txt", "User-agent: *\n"));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/robots.txt");
        request.Headers.AcceptEncoding.ParseAdd("br");
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(response.Content.Headers.ContentEncoding);
        Assert.Empty(response.Headers.Vary);
        Assert.Equal("User-agent: *\n", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("", false)]
    [InlineData("br", true)]
    [InlineData("gzip, deflate, br, zstd", true)]
    [InlineData("BR;q=0.5", true)]
    [InlineData("gzip", false)]
    [InlineData("br;q=0", false)]
    [InlineData("*", true)]
    [InlineData("*;q=0", false)]
    [InlineData("br;q=0, *", false)]
    public void Accepts_brotli_per_the_accept_encoding_header(string acceptEncoding, bool expected) =>
        Assert.Equal(expected, SiteFileMiddleware.AcceptsBrotli(new StringValues(acceptEncoding)));

    [Fact]
    public async Task Matching_if_none_match_returns_not_modified()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("docs/page/index.html", Page));

        using var first = await server.Client.GetAsync("/docs/page/");
        var etag = first.Headers.ETag;
        Assert.NotNull(etag);

        foreach (var ifNoneMatch in new[] { etag.Tag, $"W/{etag.Tag}", "\"other\", " + etag.Tag, "*" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/docs/page/");
            request.Headers.TryAddWithoutValidation("If-None-Match", ifNoneMatch);
            using var response = await server.Client.SendAsync(request);

            Assert.Equal(HttpStatusCode.NotModified, response.StatusCode);
            Assert.Equal(etag.Tag, response.Headers.ETag?.Tag);
            Assert.Equal("no-cache", response.Headers.CacheControl?.ToString());
            Assert.Empty(await response.Content.ReadAsByteArrayAsync());
        }
    }

    [Fact]
    public async Task Other_if_none_match_returns_the_file()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("docs/page/index.html", Page));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/docs/page/");
        request.Headers.TryAddWithoutValidation("If-None-Match", "\"stale\"");
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Page, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task If_modified_since_applies_only_without_if_none_match()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("docs/page/index.html", Page));

        using var first = await server.Client.GetAsync("/docs/page/");
        var lastModified = first.Content.Headers.LastModified;
        Assert.NotNull(lastModified);

        using var conditional = new HttpRequestMessage(HttpMethod.Get, "/docs/page/");
        conditional.Headers.IfModifiedSince = lastModified;
        using var notModified = await server.Client.SendAsync(conditional);
        Assert.Equal(HttpStatusCode.NotModified, notModified.StatusCode);

        using var both = new HttpRequestMessage(HttpMethod.Get, "/docs/page/");
        both.Headers.IfModifiedSince = lastModified;
        both.Headers.TryAddWithoutValidation("If-None-Match", "\"stale\"");
        using var modified = await server.Client.SendAsync(both);
        Assert.Equal(HttpStatusCode.OK, modified.StatusCode);
    }

    [Fact]
    public async Task ETag_follows_a_file_that_changes()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("data.json", "{\"v\":1}"));

        using var before = await server.Client.GetAsync("/data.json");
        await File.WriteAllTextAsync(Path.Combine(server.WebRoot, "data.json"), "{\"v\":22}");
        using var after = await server.Client.GetAsync("/data.json");

        Assert.Equal(ETagOf(Encoding.UTF8.GetBytes("{\"v\":1}")), before.Headers.ETag?.Tag);
        Assert.Equal(ETagOf(Encoding.UTF8.GetBytes("{\"v\":22}")), after.Headers.ETag?.Tag);
        Assert.Equal("{\"v\":22}", await after.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/_astro/index.Bx1y2z3.js", SiteFileMiddleware.ImmutableCacheControl)]
    [InlineData("/_astro/logo.Bx1y2z3.png", SiteFileMiddleware.ImmutableCacheControl)]
    [InlineData("/favicon.svg", SiteFileMiddleware.MediaCacheControl)]
    [InlineData("/images/hero.webp", SiteFileMiddleware.MediaCacheControl)]
    [InlineData("/fonts/site.woff2", SiteFileMiddleware.MediaCacheControl)]
    [InlineData("/casts/demo.mp4", SiteFileMiddleware.MediaCacheControl)]
    [InlineData("/docs/page/index.html", SiteFileMiddleware.DefaultCacheControl)]
    [InlineData("/docs/page.md", SiteFileMiddleware.DefaultCacheControl)]
    [InlineData("/pagefind/pagefind.js", SiteFileMiddleware.DefaultCacheControl)]
    public async Task Cache_control_depends_on_the_path_and_the_type(string path, string expected)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile(path, "x"));

        using var response = await server.Client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // HttpClient reorders the directives it parses; compare what the server sent.
        Assert.Equal(expected, response.Headers.NonValidated["Cache-Control"].ToString());
    }

    [Fact]
    public async Task Markdown_is_served_as_text_markdown()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => SamplePages.SeedFolderPage(root, "docs/page"));

        using var response = await server.Client.GetAsync("/docs/page.md");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/markdown", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Head_sends_the_headers_without_the_body()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("docs/page/index.html", Page));

        using var response = await server.Client.SendAsync(new HttpRequestMessage(HttpMethod.Head, "/docs/page/"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Encoding.UTF8.GetByteCount(Page), response.Content.Headers.ContentLength);
        Assert.NotNull(response.Headers.ETag);
        Assert.Empty(await response.Content.ReadAsByteArrayAsync());
    }

    [Theory]
    [InlineData("bytes=2-5", HttpStatusCode.PartialContent, "2345", "bytes 2-5/10")]
    [InlineData("bytes=7-", HttpStatusCode.PartialContent, "789", "bytes 7-9/10")]
    [InlineData("bytes=-3", HttpStatusCode.PartialContent, "789", "bytes 7-9/10")]
    [InlineData("bytes=8-100", HttpStatusCode.PartialContent, "89", "bytes 8-9/10")]
    [InlineData("bytes=0-1, 4-5", HttpStatusCode.OK, "0123456789", null)]
    [InlineData("items=0-1", HttpStatusCode.OK, "0123456789", null)]
    public async Task Answers_a_single_byte_range(string range, HttpStatusCode status, string body, string? contentRange)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("casts/demo.mp4", "0123456789"));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/casts/demo.mp4");
        request.Headers.TryAddWithoutValidation("Range", range);
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(status, response.StatusCode);
        Assert.Equal(body, await response.Content.ReadAsStringAsync());
        Assert.Equal(contentRange, response.Content.Headers.ContentRange?.ToString());
        Assert.Equal(["bytes"], response.Headers.AcceptRanges);
    }

    [Fact]
    public async Task Range_past_the_end_is_not_satisfiable()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("casts/demo.mp4", "0123456789"));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/casts/demo.mp4");
        request.Headers.TryAddWithoutValidation("Range", "bytes=10-");
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.RequestedRangeNotSatisfiable, response.StatusCode);
        Assert.Equal("bytes */10", response.Content.Headers.ContentRange?.ToString());
    }

    [Fact]
    public async Task If_range_applies_the_range_only_to_the_current_file()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("casts/demo.mp4", "0123456789"));
        using var first = await server.Client.GetAsync("/casts/demo.mp4");
        var etag = first.Headers.ETag!.Tag;

        foreach (var (ifRange, status) in new[] { (etag, HttpStatusCode.PartialContent), ("\"stale\"", HttpStatusCode.OK) })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/casts/demo.mp4");
            request.Headers.TryAddWithoutValidation("Range", "bytes=0-1");
            request.Headers.TryAddWithoutValidation("If-Range", ifRange);
            using var response = await server.Client.SendAsync(request);

            Assert.Equal(status, response.StatusCode);
        }
    }

    [Theory]
    [InlineData("/missing.html")]
    [InlineData("/missing/")]
    [InlineData("/docs")]
    public async Task Missing_files_fall_through(string path)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => SeedCompressedPage(root, "docs/page"));

        using var response = await server.Client.GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("/pagefind/fragment/en_1a2b3c4.pf_fragment")]
    [InlineData("/pagefind/wasm.en.pagefind")]
    [InlineData("/casts/demo.cast")]
    public async Task Files_of_unknown_types_are_served_as_octet_stream(string path)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile(path, "x"));

        using var response = await server.Client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/octet-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("x", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Post_falls_through()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root => root.WriteFile("data.json", "{}"));

        using var response = await server.Client.PostAsync("/data.json", new StringContent("{}"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Matched_endpoint_takes_precedence_over_a_file()
    {
        using var wwwroot = new TempWebRoot();
        wwwroot.WriteFile("api/data.json", "{\"from\":\"file\"}");
        wwwroot.WriteFile("other.json", "{\"from\":\"file\"}");

        using var host = new HostBuilder()
            .ConfigureLogging(static logging => logging.ClearProviders())
            .ConfigureWebHost(web =>
            {
                web.UseTestServer();
                web.UseWebRoot(wwwroot.Path);
                web.ConfigureServices(static services => services.AddRouting().AddSiteFiles());
                web.Configure(static app =>
                {
                    app.UseRouting();
                    app.UseSiteFiles();
                    app.UseEndpoints(static endpoints => endpoints.MapGet("/api/data.json", () => Results.Text("endpoint")));
                });
            })
            .Build();
        await host.StartAsync();
        using var client = host.GetTestClient();

        Assert.Equal("endpoint", await client.GetStringAsync("/api/data.json"));
        Assert.Equal("{\"from\":\"file\"}", await client.GetStringAsync("/other.json"));

        await host.StopAsync();
    }

    private static void SeedCompressedPage(TempWebRoot root, string slug)
    {
        root.WriteFile($"{slug}/index.html", Page);

        using var output = new MemoryStream();
        using (var brotli = new BrotliStream(output, CompressionLevel.SmallestSize, leaveOpen: true))
        {
            brotli.Write(Encoding.UTF8.GetBytes(Page));
        }

        File.WriteAllBytes(Path.Combine(root.Path, slug.Replace('/', Path.DirectorySeparatorChar), "index.html.br"), output.ToArray());
    }

    private static string ETagOf(byte[] content) => $"\"{Convert.ToBase64String(SHA256.HashData(content))}\"";
}
