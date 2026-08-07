namespace StaticHost.Tests;

public sealed class MarkdownNegotiationTests
{
    [Fact]
    public async Task Get_with_markdown_accept_returns_md_companion()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            SamplePages.SeedRoot(root);
            SamplePages.SeedFolderPage(root, "get-started");
        });

        using var request = new HttpRequestMessage(HttpMethod.Get, "/get-started/");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown"));
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/markdown", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("utf-8", response.Content.Headers.ContentType?.CharSet);
        var body = await response.Content.ReadAsStringAsync();
        Assert.StartsWith("#", body);
        Assert.DoesNotContain("<html", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Markdown_response_uses_private_no_cache_for_front_door()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(
            root => SamplePages.SeedFolderPage(root, "get-started"));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/get-started/");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown"));
        using var response = await server.Client.SendAsync(request);

        Assert.True(response.Headers.CacheControl?.Private ?? false,
            "Cache-Control must be private to avoid Front Door cache-key explosion on Vary: Accept.");
        Assert.Equal(TimeSpan.Zero, response.Headers.CacheControl?.MaxAge);
        Assert.True(response.Headers.CacheControl?.MustRevalidate ?? false);
        Assert.Contains("Accept", response.Headers.Vary);
    }

    [Fact]
    public async Task Head_with_markdown_accept_returns_headers_only()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(
            root => SamplePages.SeedFolderPage(root, "get-started"));

        using var request = new HttpRequestMessage(HttpMethod.Head, "/get-started/");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown"));
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/markdown", response.Content.Headers.ContentType?.MediaType);
        // ContentLength header should be set even on HEAD.
        Assert.NotNull(response.Content.Headers.ContentLength);
        Assert.True(response.Content.Headers.ContentLength > 0);
    }

    [Fact]
    public async Task Browser_request_unaffected_by_negotiation_middleware()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(
            root => SamplePages.SeedFolderPage(root, "get-started"));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/get-started/");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/html"));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/xhtml+xml"));
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        // No Vary: Accept on plain HTML responses (so Front Door can still cache).
        Assert.DoesNotContain("Accept", response.Headers.Vary);
    }

    [Fact]
    public async Task Markdown_preferred_with_no_companion_falls_back_to_html_when_acceptable()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            // Page exists but has no .md companion (e.g. /reference/api/csharp/...)
            root.WriteFile("reference/api/csharp/index.html", SamplePages.Html);
        });

        using var request = new HttpRequestMessage(HttpMethod.Get, "/reference/api/csharp/");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown", 1.0));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/html", 0.5));
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Markdown_only_without_companion_returns_406()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile("reference/api/csharp/index.html", SamplePages.Html);
        });

        using var request = new HttpRequestMessage(HttpMethod.Get, "/reference/api/csharp/");
        request.Headers.Accept.Clear();
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown"));
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotAcceptable, response.StatusCode);
    }

    [Fact]
    public async Task Stray_md_without_html_sibling_does_not_get_served_as_markdown()
    {
        // Mirrors the LinkHeader stray-md test: a .md without a corresponding
        // HTML page must NOT be served as a "companion" of the URL.
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile("stray.md", "# stray\n");
        });

        using var request = new HttpRequestMessage(HttpMethod.Get, "/stray/");
        request.Headers.Accept.Clear();
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown"));
        using var response = await server.Client.SendAsync(request);

        // No HTML companion means no markdown either: must NOT 200 with the .md body.
        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task WellKnown_paths_skip_markdown_negotiation()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile(".well-known/agent-skills/index.json", "{\"skills\":[]}");
        });

        using var request = new HttpRequestMessage(HttpMethod.Get, "/.well-known/agent-skills/index.json");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown"));
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Should still be served as JSON, not markdown.
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
    }
}
