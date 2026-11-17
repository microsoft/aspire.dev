namespace E2E.Jint;

/// <summary>Port of src/frontend/tests/e2e/analytics-scripts.spec.ts (requests only, no page).</summary>
[Collection(nameof(Site))]
public sealed class AnalyticsScriptsTests(Site site)
{
    [Theory]
    [InlineData("/scripts/analytics/1ds.js", "oneDS.ApplicationInsights")]
    [InlineData("/scripts/analytics/track.js", "capturePageAction")]
    public async Task Returns_javascript(string path, string marker)
    {
        using var response = await site.Http.GetAsync(path);
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(response.IsSuccessStatusCode);
        Assert.Contains("javascript", response.Content.Headers.ContentType?.MediaType ?? "");
        Assert.False(body.TrimStart().StartsWith('<'));
        Assert.Contains(marker, body);
    }

    [Fact]
    public async Task Home_page_references_static_analytics_assets()
    {
        using var response = await site.Http.GetAsync("/");
        var html = await response.Content.ReadAsStringAsync();

        Assert.True(response.IsSuccessStatusCode);
        Assert.Contains("/scripts/analytics/1ds.js", html);
        Assert.Contains("/scripts/analytics/track.js", html);
        Assert.DoesNotContain("src=\"/1ds/\"", html);
        Assert.DoesNotContain("src=\"/track/\"", html);
    }
}
