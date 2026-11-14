using System.Text.RegularExpressions;
using Jint.HtmlParser;

namespace E2E.Jint;

/// <summary>
/// Port of src/frontend/tests/e2e/og-metadata.spec.ts (requests only). Jint.HtmlParser stands in for rehype-parse.
/// </summary>
[Collection(nameof(Site) + "2")]
public sealed class OgMetadataTests(Site site)
{
    private const string SiteTagline = "Aspire is the tool for code-first, extensible, observable dev and deploy.";

    // src/frontend/src/utils/page-metadata.ts
    private const string FallbackDescription =
        "Aspire streamlines your development workflow with code-first control, modularity, and observability for distributed applications.";

    private async Task<string> GetHtmlAsync(string url)
    {
        using var response = await site.Http.GetAsync(url);
        Assert.True(response.IsSuccessStatusCode, $"{url} should return 200");
        return await response.Content.ReadAsStringAsync();
    }

    private async Task ExpectPngAsync(string path)
    {
        using var response = await site.Http.GetAsync(path);
        Assert.True(response.IsSuccessStatusCode, $"{path} should resolve to a real PNG");
        Assert.Matches(new Regex("image/png", RegexOptions.IgnoreCase), response.Content.Headers.ContentType?.MediaType ?? "");
    }

    private static List<Element> Select(Document document, Func<Element, bool> predicate)
    {
        var found = new List<Element>();
        var stack = new Stack<Node>();
        stack.Push(document);
        while (stack.Count > 0)
        {
            var node = stack.Pop();
            if (node is Element element && predicate(element)) found.Add(element);
            var children = new List<Node>();
            for (var child = node.FirstChild; child is not null; child = child.NextSibling) children.Add(child);
            for (var i = children.Count - 1; i >= 0; i--) stack.Push(children[i]);
        }

        return found;
    }

    private static List<Element> Meta(Document document, string attribute, string value) =>
        Select(document, e => e.LocalName == "meta" && e.GetAttribute(attribute) == value);

    public static TheoryData<string> DescriptionPages =>
    [
        "/", "/dashboard/overview/", "/dashboard/standalone/", "/dashboard/ai-coding-agents/",
        "/dashboard/standalone-for-python/", "/dashboard/standalone-for-nodejs/", "/get-started/ai-coding-agents/",
        "/get-started/aspire-mcp-server/", "/fundamentals/telemetry/", "/app-host/migrate-from-docker-compose/", "/da/", "/uk/",
    ];

    [Theory]
    [MemberData(nameof(DescriptionPages))]
    public async Task Uses_the_page_description_in_standard_and_social_metadata(string url)
    {
        var document = MarkupParser.ParseHtml(await GetHtmlAsync(url));
        var descriptions = Meta(document, "name", "description");
        var ogDescriptions = Meta(document, "property", "og:description");

        Assert.Single(descriptions);
        Assert.Single(ogDescriptions);
        var description = descriptions[0].GetAttribute("content");
        Assert.False(string.IsNullOrEmpty(description));
        Assert.Equal(description, ogDescriptions[0].GetAttribute("content"));
        Assert.NotEqual(SiteTagline, description);
    }

    [Theory]
    [InlineData("/", "website")]
    [InlineData("/da/", "website")]
    [InlineData("/support/", "website")]
    [InlineData("/fundamentals/telemetry/", "article")]
    public async Task Emits_a_single_og_type(string url, string ogType)
    {
        var document = MarkupParser.ParseHtml(await GetHtmlAsync(url));
        var ogTypes = Meta(document, "property", "og:type");

        Assert.Single(ogTypes);
        Assert.Equal(ogType, ogTypes[0].GetAttribute("content"));
    }

    [Fact]
    public async Task Preserves_Starlight_content_languages_and_canonical_links_for_translations_and_fallbacks()
    {
        foreach (var (url, locale, contentLanguage) in new[]
        {
            ("/da/", "da", "da"), ("/uk/", "uk", "uk"), ("/ja/fundamentals/telemetry/", "ja", "ja"),
            ("/da/fundamentals/telemetry/", "da", "en"), ("/uk/fundamentals/telemetry/", "uk", "en"),
        })
        {
            var document = MarkupParser.ParseHtml(await GetHtmlAsync(url));
            Assert.Equal(locale, Select(document, e => e.LocalName == "html").FirstOrDefault()?.GetAttribute("lang"));
            Assert.Equal(contentLanguage, Select(document, e => e.LocalName == "main").FirstOrDefault()?.GetAttribute("lang"));
            Assert.Equal($"https://aspire.dev{url}", Select(document, e => e.LocalName == "link" && e.GetAttribute("rel") == "canonical").FirstOrDefault()?.GetAttribute("href"));
            Assert.Equal($"https://aspire.dev{url}", Select(document, e => e.LocalName == "link" && e.GetAttribute("hreflang") == locale).FirstOrDefault()?.GetAttribute("href"));
        }
    }

    [Fact]
    public async Task Uses_Starlight_site_description_only_when_page_frontmatter_has_no_description()
    {
        var document = MarkupParser.ParseHtml(await GetHtmlAsync("/ja/architecture/resource-publishing/"));
        var descriptions = Meta(document, "name", "description");
        var ogDescriptions = Meta(document, "property", "og:description");

        Assert.Single(descriptions);
        Assert.Equal(SiteTagline, descriptions[0].GetAttribute("content"));
        Assert.Single(ogDescriptions);
        Assert.Equal(FallbackDescription, ogDescriptions[0].GetAttribute("content"));
    }

    private static Regex MetaTag(string attribute, string value, string content)
    {
        var attributeChunk = $"{attribute}=\"{Regex.Escape(value)}\"";
        var contentChunk = $"content=\"{Regex.Escape(content)}\"";
        return new Regex($"<meta\\b[^>]*(?:{attributeChunk}[^>]*{contentChunk}|{contentChunk}[^>]*{attributeChunk})[^>]*\\/?>", RegexOptions.IgnoreCase);
    }

    private static Regex MetaImage(string attribute, string value, string path) =>
        new($"<meta\\b[^>]*{attribute}=\"{Regex.Escape(value)}\"[^>]*content=\"[^\"]*{Regex.Escape(path)}\"", RegexOptions.IgnoreCase);

    [Fact]
    public async Task Emits_page_specific_Open_Graph_metadata_for_enable_browser_telemetry()
    {
        const string ogImagePath = "/og/dashboard/enable-browser-telemetry.png";
        const string title = "Enable browser telemetry in the Aspire dashboard today";
        var html = await GetHtmlAsync("/dashboard/enable-browser-telemetry/");

        Assert.Matches(MetaTag("property", "og:title", title), html);
        Assert.Matches(MetaTag("property", "og:description", "Enable browser telemetry in the Aspire dashboard to capture client-side OpenTelemetry logs, traces, and metrics from front-end JavaScript apps."), html);
        Assert.Matches(MetaImage("property", "og:image", ogImagePath), html);
        Assert.Matches(MetaTag("property", "og:image:width", "1200"), html);
        Assert.Matches(MetaTag("property", "og:image:height", "630"), html);
        Assert.Matches(MetaTag("property", "og:image:type", "image/png"), html);
        Assert.Matches(MetaTag("name", "twitter:title", title), html);
        Assert.Matches(MetaImage("name", "twitter:image", ogImagePath), html);
        await ExpectPngAsync(ogImagePath);
    }

    [Fact]
    public async Task Emits_a_stable_hash_free_og_image_for_sample_detail_pages()
    {
        const string ogImagePath = "/og/reference/samples/node-express-redis.png";
        var html = await GetHtmlAsync("/reference/samples/node-express-redis/");

        Assert.DoesNotMatch(new Regex("<meta\\b[^>]*property=\"og:image\"[^>]*content=\"[^\"]*\\/_astro\\/", RegexOptions.IgnoreCase), html);
        Assert.Matches(MetaImage("property", "og:image", ogImagePath), html);
        Assert.Matches(MetaTag("property", "og:image:width", "1200"), html);
        Assert.Matches(MetaTag("property", "og:image:height", "630"), html);
        Assert.Matches(MetaTag("property", "og:image:type", "image/png"), html);
        Assert.Matches(MetaImage("name", "twitter:image", ogImagePath), html);
        await ExpectPngAsync(ogImagePath);
    }

    [Fact]
    public async Task Emits_a_resolvable_og_image_for_samples_without_a_primary_thumbnail()
    {
        const string ogImagePath = "/og/reference/samples/custom-resources.png";
        var html = await GetHtmlAsync("/reference/samples/custom-resources/");

        Assert.DoesNotMatch(new Regex("<meta\\b[^>]*property=\"og:image\"[^>]*content=\"[^\"]*\\/_astro\\/", RegexOptions.IgnoreCase), html);
        Assert.Matches(MetaImage("property", "og:image", ogImagePath), html);
        await ExpectPngAsync(ogImagePath);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/reference/api/typescript/aspire.hosting.redis/")]
    public async Task Falls_back_to_the_site_wide_image(string url)
    {
        var html = await GetHtmlAsync(url);

        Assert.Matches(MetaImage("property", "og:image", "/og-image.png"), html);
        Assert.DoesNotMatch(new Regex("/og/reference/api/typescript/", RegexOptions.IgnoreCase), html);
        using var image = await site.Http.GetAsync("/og-image.png");
        Assert.True(image.IsSuccessStatusCode, "the fallback /og-image.png must exist");
    }
}
