namespace StaticHost.Tests;

public sealed class LocaleFallbackTests
{
    private const string EnglishHtml = "<!doctype html><html lang=\"en\"><body>English</body></html>";
    private const string JapaneseHtml = "<!doctype html><html lang=\"ja\"><body>日本語</body></html>";

    private static void SeedSite(TempWebRoot root)
    {
        root.WriteFile("locale-fallback/locales.json", """{"locales":["de","ja","pt-br"]}""");
        root.WriteFile("index.html", EnglishHtml);
        root.WriteFile("de/index.html", "<!doctype html><html lang=\"de\"></html>");
        root.WriteFile("get-started/install-cli/index.html", EnglishHtml);
        root.WriteFile("get-started/install-cli.md", SamplePages.Markdown);
        root.WriteFile("ja/get-started/install-cli/index.html", JapaneseHtml);
    }

    [Theory]
    [InlineData("/de/get-started/install-cli/")]
    [InlineData("/pt-br/get-started/install-cli/")]
    public async Task Untranslated_locale_route_serves_english_page_in_place(string path)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(SeedSite);

        using var response = await server.Client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(EnglishHtml, await response.Content.ReadAsStringAsync());
        Assert.Equal(["en"], response.Content.Headers.ContentLanguage);
        Assert.Contains(
            "</get-started/install-cli.md>; rel=\"alternate\"",
            string.Join(",", response.Headers.GetValues("Link")));
    }

    [Fact]
    public async Task Translated_locale_route_is_served_unchanged()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(SeedSite);

        using var response = await server.Client.GetAsync("/ja/get-started/install-cli/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(JapaneseHtml, await response.Content.ReadAsStringAsync());
        Assert.Empty(response.Content.Headers.ContentLanguage);
    }

    [Fact]
    public async Task Untranslated_locale_route_negotiates_english_markdown()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(SeedSite);

        using var request = new HttpRequestMessage(HttpMethod.Get, "/de/get-started/install-cli/");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/markdown"));
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/markdown", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(SamplePages.Markdown, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Untranslated_locale_markdown_companion_serves_english_markdown()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(SeedSite);

        using var response = await server.Client.GetAsync("/de/get-started/install-cli.md");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SamplePages.Markdown, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/de/get-started/install-cli?tab=cli", "/de/get-started/install-cli/?tab=cli")]
    [InlineData("/DE/get-started/install-cli/", "/de/get-started/install-cli/")]
    [InlineData("/de/Get-Started/Install-CLI/", "/de/get-started/install-cli/")]
    public async Task Non_canonical_locale_route_redirects_within_the_locale(
        string path,
        string expectedLocation)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(SeedSite);

        using var response = await server.Client.GetAsync(path);

        Assert.Equal(HttpStatusCode.PermanentRedirect, response.StatusCode);
        Assert.Equal(expectedLocation, response.Headers.Location?.OriginalString);
    }

    [Theory]
    [InlineData("/de/missing/")]
    [InlineData("/fr/get-started/install-cli/")]
    [InlineData("/xx/get-started/install-cli/")]
    public async Task Unknown_locale_or_missing_page_returns_not_found(string path)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(SeedSite);

        using var response = await server.Client.GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Fallback_is_disabled_without_a_locale_manifest()
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile("get-started/install-cli/index.html", EnglishHtml);
        });

        using var response = await server.Client.GetAsync("/de/get-started/install-cli/");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
