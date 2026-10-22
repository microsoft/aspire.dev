using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StaticHost.AgentReadiness;
using StaticHost.HybridApiDocs;

namespace StaticHost.Tests;

public sealed class HybridApiDocsTests
{
    [Fact]
    public async Task AlwaysForwardsSequentialRequestsEvenWhenAstroReportsCacheHits()
    {
        await using var host = await HybridHost.StartAsync();
        for (var index = 0; index < 3; index++)
            Assert.Equal("html:demo", await host.Client.GetStringAsync("/reference/api/demo/"));
        Assert.Equal(3, host.Renderer.Calls["/reference/api/demo/"]);
        using var response = await host.Client.GetAsync("/reference/api/demo/");
        Assert.Equal("HIT", Assert.Single(response.Headers.GetValues("X-Astro-Cache")));
        Assert.True(response.Headers.CacheControl!.NoCache);
        Assert.False(response.Headers.CacheControl.NoStore);
        Assert.True(response.Headers.ETag!.IsWeak);
        Assert.False(response.Headers.Contains("Vary"));
    }

    [Fact]
    public async Task ConcurrentRequestsForOneColdPageShareASingleRender()
    {
        await using var host = await HybridHost.StartAsync();
        host.Renderer.Gate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var requests = Enumerable.Range(0, 20).Select(_ => host.Client.GetStringAsync("/reference/api/demo/")).ToArray();
        await Task.Delay(200);
        host.Renderer.Gate.SetResult();
        Assert.All(await Task.WhenAll(requests), body => Assert.Equal("html:demo", body));
        Assert.Equal(1, host.Renderer.Calls["/reference/api/demo/"]);
        Assert.Equal("html:demo", await host.Client.GetStringAsync("/reference/api/demo/"));
        Assert.Equal(2, host.Renderer.Calls["/reference/api/demo/"]);
    }

    [Fact]
    public async Task AbandonedRequestsDoNotCancelTheRenderOthersAreWaitingFor()
    {
        await using var host = await HybridHost.StartAsync();
        host.Renderer.Gate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        using var abandon = new CancellationTokenSource();
        var abandoned = host.Client.GetAsync("/reference/api/demo/", abandon.Token);
        var waiting = host.Client.GetStringAsync("/reference/api/demo/");
        await Task.Delay(200);
        abandon.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => abandoned);
        host.Renderer.Gate.SetResult();
        Assert.Equal("html:demo", await waiting);
        Assert.Equal(1, host.Renderer.Calls["/reference/api/demo/"]);
    }

    [Fact]
    public async Task AnswersMatchingValidatorsWithoutCallingTheRenderer()
    {
        await using var host = await HybridHost.StartAsync();
        using var first = await host.Client.GetAsync("/reference/api/demo/");
        var etag = first.Headers.ETag!;
        async Task<HttpResponseMessage> Revalidate(string path, string tag)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, path);
            request.Headers.TryAddWithoutValidation("If-None-Match", tag);
            return await host.Client.SendAsync(request);
        }

        using var notModified = await Revalidate("/reference/api/demo/", $"\"other\", {etag}");
        Assert.Equal(HttpStatusCode.NotModified, notModified.StatusCode);
        Assert.Equal(etag, notModified.Headers.ETag);
        Assert.Empty(await notModified.Content.ReadAsByteArrayAsync());
        using var any = await Revalidate("/reference/api/demo/", "*");
        Assert.Equal(HttpStatusCode.NotModified, any.StatusCode);
        Assert.Equal(1, host.Renderer.Calls["/reference/api/demo/"]);

        using var changed = await Revalidate("/reference/api/demo/", "W/\"stale\"");
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal(2, host.Renderer.Calls["/reference/api/demo/"]);
        using var markdown = await Revalidate("/reference/api/demo.md", etag.ToString());
        Assert.Equal(HttpStatusCode.OK, markdown.StatusCode);
        Assert.NotEqual(etag, markdown.Headers.ETag);
    }

    [Fact]
    public async Task OnlyCacheablePagesGetValidators()
    {
        await using var host = await HybridHost.StartAsync();
        foreach (var page in new[] { "private", "cookie", "failure" })
        {
            using var response = await host.Client.GetAsync($"/reference/api/{page}/");
            Assert.Null(response.Headers.ETag);
            Assert.True(response.Headers.CacheControl!.NoStore);
        }
        using var request = new HttpRequestMessage(HttpMethod.Get, "/reference/api/demo/");
        request.Headers.Accept.ParseAdd("text/markdown");
        using var negotiated = await host.Client.SendAsync(request);
        Assert.Null(negotiated.Headers.ETag);
    }

    [Fact]
    public async Task QueryStringsAreNotForwardedForPages()
    {
        await using var host = await HybridHost.StartAsync();
        foreach (var path in new[] { "/reference/api/demo/?a=1", "/reference/api/demo/?a=2&q=redis", "/reference/api/demo.md?x=1" })
            await host.Client.GetStringAsync(path);
        Assert.Equal(3, host.Renderer.Requests.Count);
        Assert.DoesNotContain(host.Renderer.Requests, request => request.Contains('?'));
        Assert.Equal(2, host.Renderer.Calls["/reference/api/demo/"]);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task KeepsMarkdownAndHtmlHeadersIsolatedInEitherOrder(bool negotiatedFirst)
    {
        await using var host = await HybridHost.StartAsync();
        async Task CheckNegotiated()
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/reference/api/demo/");
            request.Headers.Accept.ParseAdd("text/markdown");
            using var response = await host.Client.SendAsync(request);
            Assert.Equal("markdown:demo", await response.Content.ReadAsStringAsync());
            Assert.True(response.Headers.CacheControl!.Private);
            Assert.Contains("Accept", response.Headers.Vary);
        }
        if (negotiatedFirst) await CheckNegotiated();
        using var markdown = await host.Client.GetAsync("/reference/api/demo.md");
        Assert.Equal("markdown:demo", await markdown.Content.ReadAsStringAsync());
        Assert.False(markdown.Headers.CacheControl!.Private);
        using var html = await host.Client.GetAsync("/reference/api/demo/");
        Assert.Equal("html:demo", await html.Content.ReadAsStringAsync());
        Assert.Contains("text/html", html.Content.Headers.ContentType!.ToString());
        Assert.Contains("/reference/api/demo.md", string.Join("", html.Headers.GetValues("Link")));
        if (!negotiatedFirst) await CheckNegotiated();
        await CheckNegotiated();
        Assert.Equal("html:demo", await host.Client.GetStringAsync("/reference/api/demo/"));
    }

    [Fact]
    public async Task HeadDoesNotPoisonGetAndUsesTheCompleteContentLength()
    {
        await using var host = await HybridHost.StartAsync();
        using var head = await host.Client.SendAsync(new HttpRequestMessage(HttpMethod.Head, "/reference/api/demo/"));
        Assert.Empty(await head.Content.ReadAsByteArrayAsync());
        Assert.Equal("html:demo".Length, head.Content.Headers.ContentLength);
        Assert.Equal("html:demo", await host.Client.GetStringAsync("/reference/api/demo/"));
    }

    [Theory]
    [InlineData("failure", HttpStatusCode.ServiceUnavailable)]
    [InlineData("broken", HttpStatusCode.BadGateway)]
    [InlineData("mismatch", HttpStatusCode.BadGateway)]
    [InlineData("oversize", HttpStatusCode.BadGateway)]
    public async Task DoesNotCacheRendererErrors(string page, HttpStatusCode expected)
    {
        await using var host = await HybridHost.StartAsync();
        for (var index = 0; index < 2; index++)
        {
            using var response = await host.Client.GetAsync($"/reference/api/{page}/");
            Assert.Equal(expected, response.StatusCode);
        }
        Assert.Equal(2, host.Renderer.Calls[$"/reference/api/{page}/"]);
    }

    [Theory]
    [InlineData("private")]
    [InlineData("cookie")]
    public async Task DoesNotCachePrivateOrCookieSettingResponses(string page)
    {
        await using var host = await HybridHost.StartAsync();
        await host.Client.GetStringAsync($"/reference/api/{page}/");
        await host.Client.GetStringAsync($"/reference/api/{page}/");
        Assert.Equal(2, host.Renderer.Calls[$"/reference/api/{page}/"]);
    }

    [Fact]
    public async Task AuthorizationHeadersDoNotBypassTheNativeCache()
    {
        await using var host = await HybridHost.StartAsync();
        host.Client.DefaultRequestHeaders.Authorization = new("Bearer", "test");
        using var response = await host.Client.GetAsync("/reference/api/demo/");
        Assert.NotNull(response.Headers.ETag);
        Assert.False(host.Renderer.SawCacheBypass);
    }

    [Fact]
    public async Task ClientPreferenceCookiesDoNotDisablePublicCachingOrReachTheWorker()
    {
        await using var host = await HybridHost.StartAsync();
        host.Client.DefaultRequestHeaders.Add("Cookie", "preference=value");
        await host.Client.GetStringAsync("/reference/api/demo/");
        Assert.False(host.Renderer.SawCacheBypass);
        Assert.False(host.Renderer.SawCookie);
    }

    [Fact]
    public async Task RendererTimeoutsAreExplicitAndNotCached()
    {
        await using var host = await HybridHost.StartAsync();
        host.Renderer.Timeout = true;
        for (var index = 0; index < 2; index++)
        {
            using var response = await host.Client.GetAsync("/reference/api/demo/");
            Assert.Equal(HttpStatusCode.GatewayTimeout, response.StatusCode);
        }
        Assert.Equal(2, host.Renderer.Calls["/reference/api/demo/"]);
    }

    [Fact]
    public async Task BuffersLargeResponsesButRequiresWorkerEvenForPreviouslyVisitedApis()
    {
        await using var host = await HybridHost.StartAsync();
        using var large = await host.Client.GetAsync("/reference/api/large/");
        var body = await large.Content.ReadAsByteArrayAsync();
        Assert.True(body.Length >= 13_621_124);
        Assert.Equal(body.Length, large.Content.Headers.ContentLength);
        Assert.Empty(large.Headers.TransferEncoding);
        await host.Client.GetStringAsync("/reference/api/demo/");
        host.Renderer.Offline = true;
        Assert.Equal("static guide", await host.Client.GetStringAsync("/guide/"));
        using var previouslyVisited = await host.Client.GetAsync("/reference/api/demo/");
        Assert.Equal(HttpStatusCode.BadGateway, previouslyVisited.StatusCode);
        using var cold = await host.Client.GetAsync("/reference/api/cold/");
        Assert.Equal(HttpStatusCode.BadGateway, cold.StatusCode);
    }

    [Theory]
    [InlineData("/reference/api/large/", "br")]
    [InlineData("/reference/api/large/", "gzip")]
    [InlineData("/reference/api/demo.md", "br")]
    [InlineData("/guide/", "br")]
    public async Task CompressesForwardedAndStaticResponsesWhenTheClientAllowsIt(string path, string encoding)
    {
        await using var host = await HybridHost.StartAsync();
        using var plain = await host.Client.GetAsync(path);
        var expected = await plain.Content.ReadAsByteArrayAsync();
        Assert.Empty(plain.Content.Headers.ContentEncoding);

        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.AcceptEncoding.ParseAdd(encoding);
        using var response = await host.Client.SendAsync(request);
        var compressed = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(encoding, Assert.Single(response.Content.Headers.ContentEncoding));
        Assert.Contains("Accept-Encoding", response.Headers.Vary);
        if (path.EndsWith("/large/")) Assert.True(compressed.Length < 1_000_000);

        await using var input = new MemoryStream(compressed);
        await using Stream decoder = encoding == "br"
            ? new System.IO.Compression.BrotliStream(input, System.IO.Compression.CompressionMode.Decompress)
            : new System.IO.Compression.GZipStream(input, System.IO.Compression.CompressionMode.Decompress);
        using var decoded = new MemoryStream();
        await decoder.CopyToAsync(decoded);
        Assert.Equal(expected, decoded.ToArray());
    }

    [Fact]
    public async Task SpreadsPagesAcrossReplicasAndKeepsEachPageOnTheSameOne()
    {
        await using var host = await HybridHost.StartAsync(["http://primary/", "http://standby/"]);
        foreach (var page in HybridHost.SpreadPages)
            for (var visit = 0; visit < 3; visit++)
                Assert.Equal($"html:{page}", await host.Client.GetStringAsync($"/reference/api/{page}/"));
        var primaryPages = HybridHost.SpreadPages.Count(page => HybridHost.PreferredReplica(page) == 0);
        Assert.InRange(primaryPages, 1, HybridHost.SpreadPages.Length - 1);
        Assert.Equal(primaryPages * 3, host.Renderer.EndpointCalls["primary"]);
        Assert.Equal((HybridHost.SpreadPages.Length - primaryPages) * 3, host.Renderer.EndpointCalls["standby"]);
    }

    [Fact]
    public async Task FailsOverAndSkipsAFailedReplicaDuringItsCooldown()
    {
        await using var host = await HybridHost.StartAsync(["http://primary/", "http://standby/"]);
        host.Renderer.OfflineHosts.Add("primary");
        var page = HybridHost.PageFor(0);
        Assert.Equal($"html:{page}", await host.Client.GetStringAsync($"/reference/api/{page}/"));
        Assert.Equal(1, host.Renderer.EndpointCalls["primary"]);
        Assert.Equal(1, host.Renderer.EndpointCalls["standby"]);
        Assert.Equal($"html:{page}", await host.Client.GetStringAsync($"/reference/api/{page}/"));
        Assert.Equal(1, host.Renderer.EndpointCalls["primary"]);
        Assert.Equal(2, host.Renderer.EndpointCalls["standby"]);
    }

    [Fact]
    public async Task ReadinessRequiresAnAvailableMatchingBuild()
    {
        await using var host = await HybridHost.StartAsync(["http://primary/", "http://standby/"]);
        host.Renderer.OfflineHosts.Add("primary");
        using var ready = await host.Client.GetAsync("/healthz/api-docs");
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        host.Renderer.MismatchedHosts.Add("standby");
        using var mismatch = await host.Client.GetAsync("/healthz/api-docs");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, mismatch.StatusCode);
        host.Renderer.Offline = true;
        using var down = await host.Client.GetAsync("/healthz/api-docs");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, down.StatusCode);
        Assert.Equal("static guide", await host.Client.GetStringAsync("/guide/"));
    }

    [Fact]
    public async Task RejectsMismatchedReplicasButStillUsesThemAsALastResort()
    {
        await using var host = await HybridHost.StartAsync(["http://primary/", "http://standby/"]);
        var page = HybridHost.PageFor(0);
        host.Renderer.MismatchedHosts.Add("primary");
        Assert.Equal($"html:{page}", await host.Client.GetStringAsync($"/reference/api/{page}/"));
        Assert.Equal(1, host.Renderer.EndpointCalls["standby"]);
        host.Renderer.MismatchedHosts.Clear();
        host.Renderer.OfflineHosts.Add("standby");
        Assert.Equal($"html:{page}", await host.Client.GetStringAsync($"/reference/api/{page}/"));
        Assert.Equal(2, host.Renderer.EndpointCalls["primary"]);
    }

    [Fact]
    public async Task RetriesServerErrorsAgainstAnotherReplicaBeforeSendingTheResponse()
    {
        await using var host = await HybridHost.StartAsync(["http://primary/", "http://standby/"]);
        host.Renderer.ErrorHosts.Add("primary");
        var page = HybridHost.PageFor(0);
        Assert.Equal($"html:{page}", await host.Client.GetStringAsync($"/reference/api/{page}/"));
        Assert.Equal(1, host.Renderer.EndpointCalls["primary"]);
        Assert.Equal(1, host.Renderer.EndpointCalls["standby"]);
    }

    [Theory]
    [InlineData("/casts/demo.cast", "application/octet-stream")]
    [InlineData("/pagefind/pagefind.en_abc.pf_meta", "application/octet-stream")]
    [InlineData("/pagefind/wasm.en.pagefind", "application/octet-stream")]
    [InlineData("/_astro/logo.svg", "image/svg+xml")]
    public async Task ServesEveryClientFileIncludingTypesWithoutAMimeMapping(string path, string contentType)
    {
        await using var host = await HybridHost.StartAsync();
        using var response = await host.Client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(contentType, response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(path.StartsWith("/_astro") ? "public, max-age=31536000, immutable" : "no-cache",
            response.Headers.CacheControl!.ToString());
        Assert.Empty(host.Renderer.Calls);
    }

    [Fact]
    public async Task PrerenderedApiPagesAreServedAsStaticFilesWithoutTheRenderer()
    {
        await using var host = await HybridHost.StartAsync();
        Assert.Equal("static landing", await host.Client.GetStringAsync("/reference/api/landing/"));
        Assert.Empty(host.Renderer.Calls);
    }

    [Fact]
    public async Task UnknownApiPagesGetTheSiteNotFoundPage()
    {
        await using var host = await HybridHost.StartAsync();
        using var missing = await host.Client.GetAsync("/reference/api/not-a-page/");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("site not found", await missing.Content.ReadAsStringAsync());
        Assert.Contains("text/html", missing.Content.Headers.ContentType!.ToString());
        Assert.True(missing.Headers.CacheControl!.NoStore);
        Assert.Empty(host.Renderer.Calls);
    }

    [Theory]
    [InlineData(false, HttpStatusCode.BadGateway)]
    [InlineData(true, HttpStatusCode.GatewayTimeout)]
    public async Task UnavailableRenderersGetARetryPage(bool timeout, HttpStatusCode expected)
    {
        await using var host = await HybridHost.StartAsync();
        host.Renderer.Offline = !timeout;
        host.Renderer.Timeout = timeout;
        using var response = await host.Client.GetAsync("/reference/api/demo/");
        Assert.Equal(expected, response.StatusCode);
        Assert.Contains("Try again", await response.Content.ReadAsStringAsync());
        Assert.Contains("text/html", response.Content.Headers.ContentType!.ToString());
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.Equal("5", Assert.Single(response.Headers.GetValues("Retry-After")));

        using var head = await host.Client.SendAsync(new HttpRequestMessage(HttpMethod.Head, "/reference/api/demo/"));
        Assert.Equal(expected, head.StatusCode);
        Assert.Empty(await head.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task CanonicalizesAndRedirectsWithoutInvokingWorker()
    {
        await using var host = await HybridHost.StartAsync();
        using var canonical = await host.Client.GetAsync("/REFERENCE/API/DEMO");
        Assert.Equal(HttpStatusCode.PermanentRedirect, canonical.StatusCode);
        Assert.Equal("/reference/api/demo/", canonical.Headers.Location!.OriginalString);
        using var markdown = await host.Client.GetAsync("/reference/api/demo.md/");
        Assert.Equal(HttpStatusCode.PermanentRedirect, markdown.StatusCode);
        Assert.Equal("/reference/api/demo.md", markdown.Headers.Location!.OriginalString);
        using var redirect = await host.Client.GetAsync("/old-guide/?a=1");
        Assert.Equal(HttpStatusCode.Found, redirect.StatusCode);
        Assert.Equal("/guide/?a=1", redirect.Headers.Location!.OriginalString);
        using var missing = await host.Client.GetAsync("/reference/api/not-a-page/");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        using var method = await host.Client.PostAsync("/reference/api/demo/", null);
        Assert.Equal(HttpStatusCode.MethodNotAllowed, method.StatusCode);
        Assert.Empty(host.Renderer.Calls);
    }

    [Fact]
    public async Task AllowsOnlyBundledImagesAndBoundsTransformDimensions()
    {
        await using var host = await HybridHost.StartAsync();
        using var allowed = await host.Client.GetAsync("/_image?href=%2F_astro%2Flogo.svg&w=48&h=48");
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        using var remote = await host.Client.GetAsync("/_image?href=https%3A%2F%2Fexample.com%2Fimage.svg");
        Assert.Equal(HttpStatusCode.BadRequest, remote.StatusCode);
        using var oversized = await host.Client.GetAsync("/_image?href=%2F_astro%2Flogo.svg&w=999999");
        Assert.Equal(HttpStatusCode.BadRequest, oversized.StatusCode);
        Assert.Equal(1, host.Renderer.Calls["/_image"]);
        Assert.Contains(host.Renderer.Requests, request => request.StartsWith("/_image?href=", StringComparison.Ordinal));
    }

    [Fact]
    public void RejectsMissingOrEscapingArtifacts()
    {
        using var root = new TempWebRoot();
        Assert.Throws<InvalidOperationException>(() => HybridApiDocsArtifact.Load(Path.Combine(root.Path, "missing.json")));
        root.WriteFile("hybrid.json", JsonSerializer.Serialize(new HybridApiManifest(
            1, "hybrid-api-docs", new string('a', 64), "../escape", "server/entry.mjs",
            "https://aspire.dev", [], [], OperatingSystem.IsWindows() ? "win32" : "linux"), new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        Assert.Throws<InvalidOperationException>(() => HybridApiDocsArtifact.Load(Path.Combine(root.Path, "hybrid.json")));
    }

    [Theory]
    [InlineData("Production", null)]
    [InlineData("Production", "true")]
    [InlineData("Development", null)]
    [InlineData("Development", "false")]
    public void RequiresTheArtifactUnlessAViteDevServerServesTheWebsite(string environment, string? devServer)
        => Assert.Throws<InvalidOperationException>(
            () => HostEnvironment(environment).RequireArtifact(DevServerConfiguration(devServer), null));

    [Fact]
    public void AllowsApiOnlyStartupForADevelopmentRunServedByVite()
        => HostEnvironment("Development").RequireArtifact(DevServerConfiguration("true"), null);

    [Fact]
    public void StartsWithAnArtifactInAnyEnvironment()
    {
        using var root = new TempWebRoot();
        root.WriteFile("client/index.html", "home");
        root.WriteFile("hybrid.json", JsonSerializer.Serialize(new HybridApiManifest(
            1, "hybrid-api-docs", new string('a', 64), "client", "server/entry.mjs", "https://aspire.dev",
            [], [], OperatingSystem.IsWindows() ? "win32" : "linux"), new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        var artifact = HybridApiDocsArtifact.Load(Path.Combine(root.Path, "hybrid.json"));
        HostEnvironment("Production").RequireArtifact(DevServerConfiguration(null), artifact);
    }

    private static IHostEnvironment HostEnvironment(string name) => Host
        .CreateApplicationBuilder(new HostApplicationBuilderSettings { EnvironmentName = name, DisableDefaults = true })
        .Environment;

    private static IConfiguration DevServerConfiguration(string? value) => new ConfigurationBuilder()
        .AddInMemoryCollection(value is null ? [] : [new(HybridApiDocsExtensions.DevServerSetting, value)])
        .Build();
}

internal sealed class HybridHost : IAsyncDisposable
{
    private readonly WebApplication _app;
    private readonly TempWebRoot _root;
    public HttpClient Client { get; }
    public TestApiRenderer Renderer { get; }

    // Generic pages with a stable preferred replica, so routing assertions do not depend on a hash value.
    internal static readonly string[] SpreadPages = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
    internal static int PreferredReplica(string page) => HybridApiDocsEndpointPool.PreferredIndex($"/reference/api/{page}/", 2);
    internal static string PageFor(int replica) => SpreadPages.First(page => PreferredReplica(page) == replica);

    private HybridHost(WebApplication app, TempWebRoot root, TestApiRenderer renderer)
    {
        _app = app;
        _root = root;
        Renderer = renderer;
        Client = app.GetTestClient();
    }

    public static async Task<HybridHost> StartAsync(string[]? endpoints = null)
    {
        var root = new TempWebRoot();
        root.WriteFile("client/guide/index.html", "static guide");
        root.WriteFile("client/404.html", "site not found");
        root.WriteFile("client/reference/api/landing/index.html", "static landing");
        root.WriteFile("client/casts/demo.cast", "{\"version\":2}");
        root.WriteFile("client/pagefind/pagefind.en_abc.pf_meta", "meta");
        root.WriteFile("client/pagefind/wasm.en.pagefind", "wasm");
        root.WriteFile("client/_astro/logo.svg", "<svg/>");
        var pages = new[] { "demo", "private", "cookie", "failure", "broken", "mismatch", "oversize", "large", "cold" }
            .Concat(SpreadPages).ToArray();
        root.WriteFile("hybrid.json", JsonSerializer.Serialize(new HybridApiManifest(
            1, "hybrid-api-docs", new string('a', 64), "client", "server/entry.mjs", "https://aspire.dev",
            pages.Select(page => new HybridApiRoute($"/reference/api/{page}/", $"/reference/api/{page}.md")).ToArray(),
            [new("/old-guide/", "/guide/", 302)], OperatingSystem.IsWindows() ? "win32" : "linux"),
            new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        var artifact = HybridApiDocsArtifact.Load(Path.Combine(root.Path, "hybrid.json"));
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { WebRootPath = artifact.ClientDirectory });
        builder.Logging.ClearProviders();
        builder.WebHost.UseTestServer();
        builder.Services.AddHybridApiDocs(artifact, endpoints ?? ["http://renderer/"]);
        var renderer = new TestApiRenderer();
        builder.Services.AddHttpClient<HybridApiDocsRenderer>().ConfigurePrimaryHttpMessageHandler(() => renderer);
        var app = builder.Build();
        app.UseResponseCompression();
        app.UseHybridApiDocsRouting();
        app.UseAgentReadiness();
        app.UseDefaultFiles();
        app.UseStaticFiles(HybridApiDocsExtensions.HybridStaticFileOptions());
        app.UseRouting();
        app.MapHybridApiDocs();
        await app.StartAsync();
        return new HybridHost(app, root, renderer);
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await _app.DisposeAsync();
        _root.Dispose();
    }
}

internal sealed class TestApiRenderer : HttpMessageHandler
{
    public ConcurrentDictionary<string, int> Calls { get; } = new();
    public ConcurrentQueue<string> Requests { get; } = new();
    public ConcurrentDictionary<string, int> EndpointCalls { get; } = new();
    public HashSet<string> OfflineHosts { get; } = [];
    public HashSet<string> MismatchedHosts { get; } = [];
    public HashSet<string> ErrorHosts { get; } = [];
    public bool Offline { get; set; }
    public bool Timeout { get; set; }
    public TaskCompletionSource? Gate { get; set; }
    public bool SawCacheBypass { get; private set; }
    public bool SawCookie { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri!.AbsolutePath;
        var endpoint = request.RequestUri.Host;
        EndpointCalls.AddOrUpdate(endpoint, 1, (_, count) => count + 1);
        SawCacheBypass = request.Headers.TryGetValues("X-Aspire-Cache-Bypass", out var bypass)
            && bypass.SequenceEqual(["1"]);
        SawCookie = request.Headers.Contains("Cookie");
        Calls.AddOrUpdate(path, 1, (_, count) => count + 1);
        if (request.RequestUri.AbsolutePath != "/__hybrid-api-docs/health") Requests.Enqueue(request.RequestUri.PathAndQuery);
        if (Offline || OfflineHosts.Contains(endpoint)) throw new HttpRequestException("Renderer unavailable.");
        if (Timeout) throw new OperationCanceledException("Renderer timed out.");
        if (Gate is not null) await Gate.Task.WaitAsync(cancellationToken);
        await Task.Delay(30, cancellationToken);
        var page = path.Split('/').Last(segment => segment.Length > 0).Replace(".md", "");
        var response = new HttpResponseMessage(page == "failure" || ErrorHosts.Contains(endpoint)
            ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK);
        response.Headers.Add("X-Aspire-Build-Id", new string(page == "mismatch" || MismatchedHosts.Contains(endpoint) ? 'b' : 'a', 64));
        response.Headers.Add("X-Astro-Cache", "HIT");
        response.Headers.Vary.Add("X-Aspire-Cache-Bypass");
        response.Content = page switch
        {
            "broken" => new BrokenContent(),
            "oversize" => new ByteArrayContent(new byte[HybridApiDocsRenderer.MaximumBodySize + 1]),
            "large" => new ByteArrayContent(new byte[13_621_124]),
            _ => new StringContent((path.EndsWith(".md") ? "markdown:" : "html:") + page),
        };
        response.Content.Headers.ContentType = new(path.EndsWith(".md") ? "text/markdown" : "text/html");
        if (page == "cookie") response.Headers.Add("Set-Cookie", "test=value");
        response.Headers.CacheControl = page == "private"
            ? new() { Private = true, NoStore = true } : new() { Public = true };
        return response;
    }

    private sealed class BrokenContent : HttpContent
    {
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context)
            => throw new IOException("Interrupted renderer body.");
    }
}
