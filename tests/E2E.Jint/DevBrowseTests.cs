using System.Text.Json;

namespace E2E.Jint;

/// <summary>
/// Port of the src/frontend/tests/e2e/dev-browse.spec.ts tests that check behavior (URL state, filters, pagination,
/// history) rather than geometry or computed styles, which Jint.Browser's synthetic box model cannot answer.
/// </summary>
[Collection(nameof(Site))]
public sealed class DevBrowseTests(Site site)
{
    private const string Results = ".browse-result:not([hidden])";

    [Fact]
    public async Task Only_displayed_resource_artwork_is_materialized_on_first_load()
    {
        await using var page = await site.NewPageAsync();
        await page.GotoAsync("/hub/browse/");
        await page.ExpectReadyAsync();

        Assert.True(await page.CountAsync("[data-resource-entry]") > 100);
        Assert.True(await page.Page.WaitForCountAsync("[data-resource-entry]", 24, Site.Timeout, visibleOnly: true));
        Assert.Equal(0, await page.CountAsync("[data-resource-entry]:has(template[data-resource-image])", visibleOnly: true));
        Assert.True(await page.CountAsync("[data-resource-entry]:has(template[data-resource-image])") > 0);
        Assert.True(await page.CountAsync("[data-resource-entry] img") < 75);
    }

    [Fact]
    public async Task Dev_Hub_leads_to_the_complete_paginated_resource_directory()
    {
        await using var page = await site.NewPageAsync();
        await page.GotoAsync("/hub/");
        await page.ClickAsync(await page.NamedAsync("a[href=\"/hub/browse/\"][data-underline-trigger]", "Browse all resources"));
        await page.ExpectUrlAsync("/hub/browse/$");
        await page.ExpectVisibleAsync("h1");
        await page.ExpectTextAsync("main h1", "Browse resources");
        await page.ExpectCountAsync(Results, 24);
        var total = await page.CountAsync(".browse-result");
        Assert.True(total > 100);
        await page.ExpectTextAsync("[data-results-summary]", $"1-24 of {total} resources");

        var next = await page.NamedAsync("button[data-page-next][aria-label=\"Next\"]", "");
        await page.ClickAsync(next);
        await page.ExpectUrlAsync("\\?page=2$");
        await page.ExpectTextContainsAsync("[data-page-label]", "Page 2 of");
        await page.ExpectFocusedAsync(next);
        Assert.True(await page.Page.GoBackAsync(Site.Timeout));
        await page.ExpectTextContainsAsync("[data-page-label]", "Page 1 of");
    }

    [Fact]
    public async Task Tutorials_and_quickstarts_keep_their_integration_topic_while_includes_stay_excluded()
    {
        await using var page = await site.NewPageAsync();
        await page.GotoAsync("/hub/browse/?type=tutorial&topic=integrations");
        foreach (var article in new[] { "hosting-integrations", "client-integrations", "secure-communication" })
        {
            await page.ExpectVisibleAsync($"{Results} a[href=\"/integrations/custom-integrations/{article}/\"]");
        }

        await page.GotoAsync("/hub/browse/?type=quickstart&topic=integrations");
        await page.ExpectVisibleAsync($"{Results} a[href=\"/integrations/frameworks/rust/rust-get-started/\"]");
        await page.ExpectVisibleAsync($"{Results} a[href=\"/integrations/devtools/k6/k6-get-started/\"]");
        Assert.All(await page.AttributesAsync(Results, "data-resource-type"), type => Assert.Equal("quickstart", type));
        Assert.All(await page.TextsAsync($"{Results} .browse-card-kind"), kind => Assert.Equal("Quickstart", kind));

        await page.GotoAsync("/hub/browse/?type=quickstart");
        await page.ExpectVisibleAsync($"{Results} a[href=\"/get-started/github-codespaces/\"]");
        await page.ExpectVisibleAsync($"{Results} a[href=\"/get-started/dev-containers/\"]");
        Assert.Equal(0, await page.CountAsync(".browse-result a[href*=\"/includes/\"]"));
    }

    [Fact]
    public async Task Article_language_filters_include_AppHost_and_consuming_client_examples()
    {
        await using var page = await site.NewPageAsync();
        foreach (var language in new[] { "csharp", "typescript" })
        {
            await page.GotoAsync($"/hub/browse/?q=first%20app&type=quickstart&language={language}");
            await page.ExpectVisibleAsync($"{Results} a[href=\"/get-started/first-app/\"]");
        }

        foreach (var language in new[] { "csharp", "typescript", "python", "go" })
        {
            await page.GotoAsync($"/hub/browse/?q=connect%20openai&type=integration&language={language}");
            await page.ExpectVisibleAsync($"{Results} a[href=\"/integrations/ai/openai/openai-connect/\"]");
        }
    }
}

/// <summary>The second half of the dev-browse port, in its own collection so that xUnit runs it beside the first.</summary>
[Collection(nameof(Site) + "2")]
public sealed class DevBrowseFilterTests(Site site)
{
    private const string Results = ".browse-result:not([hidden])";

    [Fact]
    public async Task Every_ingested_official_blog_post_is_reachable_across_resource_pages()
    {
        using var posts = JsonDocument.Parse(File.ReadAllText(Path.Combine(Site.RepositoryRoot, "src/frontend/src/data/aspire-blog-posts.json")));
        await using var page = await site.NewPageAsync();
        await page.GotoAsync("/hub/browse/?type=blog&sort=newest");
        await page.ExpectVisibleAsync(Results);

        var seen = new HashSet<string>();
        while (true)
        {
            var first = (await page.AttributesAsync($"{Results} a", "href")).FirstOrDefault();
            foreach (var href in await page.AttributesAsync($"{Results} a", "href")) Assert.True(seen.Add(href), $"{href} is listed twice");
            var hasNext = await page.Page.IsVisibleAsync("button[data-page-next]:not(:disabled)");
            if (!hasNext) break;
            await page.ClickAsync("button[data-page-next]");
            await page.ExpectAsync($"arg => document.querySelector('{Results} a')?.getAttribute('href') !== arg.first", new { first });
        }

        foreach (var post in posts.RootElement.EnumerateArray())
        {
            Assert.True(seen.Contains(post.GetProperty("href").GetString()!), post.GetProperty("title").GetString());
        }
    }

    [Fact]
    public async Task Empty_results_preserve_useful_filters_and_unknown_URL_state_is_normalized()
    {
        await using var page = await site.NewPageAsync();
        await page.GotoAsync("/hub/browse/?q=not-a-real-resource-555&type=glossary");
        await page.ExpectTextAsync(".browse-empty .search-empty-title", "No matching resources");
        await page.ExpectTextAsync(".browse-empty .search-empty-query", "Search: \"not-a-real-resource-555\"");
        await page.ExpectCountAsync(Results, 0);
        await page.ClickAsync(await page.NamedAsync(".browse-empty [data-reset-search]", "Clear search"));
        await page.ExpectUrlAsync("/hub/browse/\\?type=glossary$");
        await page.ExpectCountAsync(Results, 24);
        await page.ExpectCountAsync(".browse-result:not([hidden])[data-resource-type=\"glossary\"]", 24);
        await page.ExpectFocusedAsync("input[placeholder=\"Search resources...\"]");

        await page.GotoAsync("/hub/browse/?type=unknown&topic=unknown&page=999999999&sort=unknown");
        await page.ExpectVisibleAsync(Results);
        await page.ExpectAsync("() => !/unknown|999999999/.test(location.href)");
    }

    [Fact]
    public async Task Multi_type_filters_and_sorting_reflect_their_URL_state()
    {
        await using var page = await site.NewPageAsync();
        await page.GotoAsync("/hub/browse/?type=video&type=blog");
        await page.ExpectReadyAsync();
        Assert.All(await page.AttributesAsync(Results, "data-resource-type"), type => Assert.Contains(type, new[] { "video", "blog" }));
        await page.ExpectSelectorAsync("[data-filter-group=\"sort\"] summary[aria-label=\"Sort by: Date Newest first, then Title A-Z\"]");
        Assert.Equal(0, await page.CountAsync("[data-sort-direction]"));
        var dates = (await page.AttributesAsync($"{Results} time", "datetime")).Select(date => date[..10]).ToArray();
        Assert.NotEmpty(dates);
        Assert.Equal(dates.OrderDescending(StringComparer.Ordinal), dates);
    }

    [Fact]
    public async Task Legacy_provider_links_do_not_leave_an_invisible_filter_active()
    {
        await using var page = await site.NewPageAsync();
        await page.GotoAsync("/hub/browse/?type=sample&sort=oldest");
        await page.ExpectReadyAsync();
        var initialResults = await page.TextsAsync($"{Results} h3");
        var initialSummary = (await page.TextsAsync("[data-results-summary]")).Single();

        await page.GotoAsync("/hub/browse/?keep=1&type=sample&provider=aws&provider=azure&sort=oldest");
        await page.ExpectUrlAsync("\\?keep=1&type=sample&sort=oldest$");
        Assert.Equal(0, await page.CountAsync("[data-filter-group=\"provider\"], input[name=\"provider\"]"));
        Assert.Equal(initialResults, await page.TextsAsync($"{Results} h3"));
        await page.ExpectTextAsync("[data-results-summary]", initialSummary);

        await page.Page.ReloadAsync();
        await page.ExpectReadyAsync();
        Assert.Equal(initialResults, await page.TextsAsync($"{Results} h3"));
        await page.ClickAsync(await page.NamedAsync("[data-reset-filters]", "Clear filters"));
        await page.ExpectUrlAsync("\\?keep=1&sort=oldest$");
        Assert.True(await page.Page.GoBackAsync(Site.Timeout));
        await page.ExpectUrlAsync("\\?keep=1&type=sample&sort=oldest$");
        await page.ExpectAsync("arg => { const list = [...document.querySelectorAll(arg.selector)].map(e => e.textContent.trim()); return list.length === arg.expected.length && list.every((text, i) => text === arg.expected[i]); }", new { selector = $"{Results} h3", expected = initialResults });
    }
}
