namespace StaticHost.Tests;

public sealed class LinkHeaderTests
{
    private const string SamplePageHtml = "<!doctype html><html><body>Hello</body></html>";
    private const string SamplePageMarkdown = "# Hello\n";

    private static string? GetLinkHeader(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Link", out var values) ? string.Join(", ", values) : null;

    [Fact]
    public async Task Html_response_includes_link_header_with_required_rels()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile("index.html", SamplePageHtml);
            root.WriteFile("index.md", SamplePageMarkdown);
            root.WriteFile("llms.txt", "# llms\n");
            root.WriteFile(".well-known/agent-skills/index.json", "{\"skills\":[]}");
            root.WriteFile("sitemap-index.xml", "<sitemapindex/>");
        });

        using var response = await server.Client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var link = GetLinkHeader(response);
        Assert.NotNull(link);
        Assert.Contains("rel=\"llms\"", link);
        Assert.Contains("rel=\"agent-skills\"", link);
        Assert.Contains("rel=\"sitemap\"", link);
        Assert.Contains("rel=\"alternate\"", link);
        Assert.Contains("type=\"text/markdown\"", link);
        // Confirm we are NOT advertising api-catalog (out of scope per RFC 9727).
        Assert.DoesNotContain("api-catalog", link);
    }

    [Fact]
    public async Task Page_without_md_companion_omits_alternate_link()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile("reference/api/csharp/index.html", SamplePageHtml);
            // no .md companion
        });

        using var response = await server.Client.GetAsync("/reference/api/csharp/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var link = GetLinkHeader(response);
        Assert.NotNull(link);
        Assert.DoesNotContain("rel=\"alternate\"", link);
        Assert.Contains("rel=\"llms\"", link);
    }

    [Fact]
    public async Task Json_response_does_not_get_link_header()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile(".well-known/agent-skills/index.json", "{\"skills\":[]}");
        });

        using var response = await server.Client.GetAsync("/.well-known/agent-skills/index.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(GetLinkHeader(response));
    }

    [Fact]
    public async Task Static_asset_path_does_not_get_link_header()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile("_astro/app.abc123.js", "/* js */");
        });

        using var response = await server.Client.GetAsync("/_astro/app.abc123.js");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(GetLinkHeader(response));
    }

    [Fact]
    public async Task Not_found_response_does_not_get_link_header()
    {
        await using var server = await AgentReadinessTestServer.StartAsync();

        using var response = await server.Client.GetAsync("/nope");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(GetLinkHeader(response));
    }

    [Fact]
    public async Task Markdown_negotiated_response_does_not_get_link_header()
    {
        // The markdown middleware short-circuits before the Link middleware
        // attaches headers; even if it didn't, the response Content-Type is
        // text/markdown, so the OnStarting predicate would skip it.
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile("index.html", SamplePageHtml);
            root.WriteFile("index.md", SamplePageMarkdown);
        });

        using var request = new HttpRequestMessage(HttpMethod.Get, "/");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown"));
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/markdown", response.Content.Headers.ContentType?.MediaType);
        Assert.Null(GetLinkHeader(response));
    }

    [Fact]
    public async Task Healthz_skipped_from_link_middleware()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            // healthz is a MapGet endpoint in production; here we just simulate
            // a static text response to exercise the path-skip guard.
            root.WriteFile("healthz/index.html", SamplePageHtml);
        });

        using var response = await server.Client.GetAsync("/healthz/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(GetLinkHeader(response));
    }
}
