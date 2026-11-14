using System.Text.Json;
using Jint.Browser;

namespace E2E.Jint;

/// <summary>
/// The site under test and one shared in-process <see cref="Browser"/>. Each test opens its own context (cookies,
/// storage) and page, as a Playwright test does.
/// </summary>
public sealed class Site : IAsyncLifetime
{
    public static readonly Uri BaseUrl = new(Environment.GetEnvironmentVariable("E2E_BASE_URL") ?? "http://127.0.0.1:4322");

    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(double.TryParse(Environment.GetEnvironmentVariable("E2E_TIMEOUT_SECONDS"), out var seconds) ? seconds : 15);

    public HttpClient Http { get; } = new() { BaseAddress = BaseUrl };

    public Browser Browser { get; private set; } = null!;

    public Task InitializeAsync()
    {
        // The desktop-chromium project of playwright.config.mjs.
        Browser = new Browser(new BrowserOptions { Viewport = new Viewport(1440, 900) });
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await Browser.DisposeAsync();
        Http.Dispose();
    }

    /// <summary>
    /// A new page in a new context, in the state of <c>emulateConsentNotRequiredRegion</c> (tests/e2e/helpers.ts):
    /// no third-party request leaves the machine (WCP never loads) and the consent flag is cached as not required.
    /// </summary>
    public async Task<SitePage> NewPageAsync()
    {
        var context = await Browser.NewContextAsync(new BrowserContextOptions
        {
            UrlFilter = uri => uri.Host == BaseUrl.Host && uri.Port == BaseUrl.Port,
        });
        var page = await context.NewPageAsync();
        // Jint.Browser has no public init-script API; a document on the site's origin, fetched from nowhere,
        // seeds that origin's localStorage for the rest of the context.
        await page.SetContentAsync("<!doctype html><title>seed</title>", BaseUrl.ToString());
        await page.EvaluateAsync("localStorage.setItem('aspireConsentRequired', 'false')");
        return new SitePage(context, page);
    }

    /// <summary>The repository root, for the data files the specs import.</summary>
    public static string RepositoryRoot
    {
        get
        {
            for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            {
                if (File.Exists(Path.Combine(directory.FullName, "global.json"))) return directory.FullName;
            }

            throw new InvalidOperationException("The repository root (global.json) was not found.");
        }
    }
}

// Two collections, each with its own browser: xUnit runs collections in parallel (maxParallelThreads 2 in
// xunit.runner.json), as the Playwright suite runs two workers in CI.
[CollectionDefinition(nameof(Site))]
public sealed class SiteCollection : ICollectionFixture<Site>;

[CollectionDefinition(nameof(Site) + "2")]
public sealed class SiteCollection2 : ICollectionFixture<Site>;

/// <summary>A page with the few Playwright-style helpers the ported specs need.</summary>
public sealed class SitePage(BrowserContext context, Page page) : IAsyncDisposable
{
    private int _marks;

    public Page Page { get; } = page;

    public Task<PageResponse?> GotoAsync(string path) => Page.NavigateAsync(new Uri(Site.BaseUrl, path).ToString());

    public async Task<string> UrlAsync() => await Page.EvaluateAsync<string>("location.href") ?? "";

    /// <summary>Waits until a JavaScript predicate (a function of one argument) is true, as <c>expect.poll</c> does.</summary>
    public async Task ExpectAsync(string predicate, object? argument = null, string? because = null)
    {
        var met = await Page.WaitForAsync(predicate, argument ?? new { }, Site.Timeout);
        Assert.True(met, because ?? $"Timed out waiting for {predicate} ({JsonSerializer.Serialize(argument)}) on {await UrlAsync()}");
    }

    public Task ExpectUrlAsync(string pattern) =>
        ExpectAsync("arg => new RegExp(arg.pattern).test(location.href)", new { pattern }, $"URL should match /{pattern}/");

    public Task ExpectCountAsync(string selector, int count) =>
        ExpectAsync("arg => document.querySelectorAll(arg.selector).length === arg.count", new { selector, count }, $"{selector} should match {count} elements");

    public Task ExpectVisibleAsync(string selector) =>
        ExpectAsync("arg => { const e = document.querySelector(arg.selector); return !!e && e.checkVisibility({ visibilityProperty: true }); }", new { selector }, $"{selector} should be visible");

    public Task ExpectTextAsync(string selector, string text) =>
        ExpectAsync("arg => document.querySelector(arg.selector)?.textContent.replace(/\\s+/g, ' ').trim() === arg.text", new { selector, text }, $"{selector} should read \"{text}\"");

    public Task ExpectTextMatchesAsync(string selector, string pattern) =>
        ExpectAsync("arg => new RegExp(arg.pattern).test(document.querySelector(arg.selector)?.textContent ?? '')", new { selector, pattern }, $"{selector} should match /{pattern}/");

    public Task ExpectFocusedAsync(string selector) =>
        ExpectAsync("arg => !!document.activeElement && document.activeElement === document.querySelector(arg.selector)", new { selector }, $"{selector} should be focused");

    public Task<int> CountAsync(string selector) => Page.EvaluateAsync<int>("arg => document.querySelectorAll(arg.selector).length", new { selector });

    public async Task<string[]> AttributesAsync(string selector, string attribute) =>
        ((object?[]?)await Page.EvaluateAsync("arg => [...document.querySelectorAll(arg.selector)].map(e => e.getAttribute(arg.attribute))", new { selector, attribute }) ?? [])
        .Select(value => value?.ToString() ?? "").ToArray();

    public async Task<string[]> TextsAsync(string selector) =>
        (await Page.TextsAsync(selector)).Select(text => text.Trim()).ToArray();

    /// <summary>
    /// The CSS selector of the first element matching <paramref name="selector"/> whose accessible text (aria-label,
    /// else text content) is <paramref name="name"/>, in the spirit of <c>getByRole(role, { name, exact: true })</c>.
    /// </summary>
    public async Task<string> ByNameAsync(string selector, string name)
    {
        var mark = $"e2e-{++_marks}";
        await ExpectAsync(
            "arg => { const e = [...document.querySelectorAll(arg.selector)].find(e => (e.getAttribute('aria-label') ?? e.textContent).replace(/\\s+/g, ' ').trim() === arg.name && e.checkVisibility()); if (e) e.setAttribute('data-e2e', arg.mark); return !!e; }",
            new { selector, name, mark },
            $"No visible {selector} named \"{name}\"");
        return $"[data-e2e=\"{mark}\"]";
    }

    public async Task ClickAsync(string selector) => Assert.True(await Page.ClickAsync(selector), $"Could not click {selector}");

    public async ValueTask DisposeAsync()
    {
        await Page.CloseAsync();
        await context.DisposeAsync();
    }
}
