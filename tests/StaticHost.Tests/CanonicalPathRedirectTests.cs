using StaticHost.Routing;

namespace StaticHost.Tests;

public sealed class CanonicalPathRedirectTests
{
    [Theory]
    [InlineData(
        "/diagnostics/ASPIRE001/?source=compiler",
        "/diagnostics/aspire001/?source=compiler")]
    [InlineData(
        "/DiAgNoStIcS/ASPIRE001",
        "/diagnostics/aspire001")]
    public async Task Case_mismatched_page_route_redirects_to_canonical_path(
        string requestPath,
        string expectedLocation)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(
            root => root.WriteFile("diagnostics/aspire001/index.html", SamplePages.Html));

        using var response = await server.Client.GetAsync(requestPath);

        Assert.Equal(HttpStatusCode.PermanentRedirect, response.StatusCode);
        Assert.Equal(expectedLocation, response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Redirect_preserves_path_base_and_query_string()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(
            root => root.WriteFile("diagnostics/aspire001/index.html", SamplePages.Html),
            pathBase: new PathString("/docs"));

        using var response = await server.Client.GetAsync(
            "/docs/DIAGNOSTICS/ASPIRE001/?source=compiler");

        Assert.Equal(HttpStatusCode.PermanentRedirect, response.StatusCode);
        Assert.Equal(
            "/docs/diagnostics/aspire001/?source=compiler",
            response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Case_mismatched_static_file_redirects_to_canonical_path()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(
            root => root.WriteFile("scripts/site.js", "console.log('Aspire');"));

        using var response = await server.Client.GetAsync("/SCRIPTS/SITE.JS");

        Assert.Equal(HttpStatusCode.PermanentRedirect, response.StatusCode);
        Assert.Equal("/scripts/site.js", response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Canonically_uppercase_file_redirects_to_its_exact_casing()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(
            root => root.WriteFile(
                ".well-known/agent-skills/getting-started/SKILL.md",
                "# Getting started"));

        using var response = await server.Client.GetAsync(
            "/.WELL-KNOWN/AGENT-SKILLS/GETTING-STARTED/skill.md");

        Assert.Equal(HttpStatusCode.PermanentRedirect, response.StatusCode);
        Assert.Equal(
            "/.well-known/agent-skills/getting-started/SKILL.md",
            response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Canonical_request_passes_through_unchanged()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(
            root => root.WriteFile("diagnostics/aspire001/index.html", SamplePages.Html));

        using var response = await server.Client.GetAsync("/diagnostics/aspire001/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Missing_path_remains_not_found()
    {
        await using var server = await AgentReadinessTestServer.StartAsync();

        using var response = await server.Client.GetAsync("/MISSING/PAGE/");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public void Ambiguous_case_only_paths_are_not_redirected()
    {
        var resolver = new CanonicalPathResolver(
        [
            "/assets/logo.svg",
            "/assets/LOGO.svg",
        ]);

        var resolved = resolver.TryResolve(
            new PathString("/assets/Logo.svg"),
            out _);

        Assert.False(resolved);
    }
}
