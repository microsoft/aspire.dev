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

    // Native waits (WaitForCountAsync, WaitForVisibleAsync, WaitForTextAsync, WaitForSelectorAsync) observe mutations
    // in .NET instead of re-running a JavaScript predicate in the page on every poll.
    public async Task ExpectCountAsync(string selector, int count) =>
        Assert.True(await Page.WaitForCountAsync(selector, count, Site.Timeout), $"{selector} should match {count} elements, found {await CountAsync(selector)}");

    public async Task ExpectVisibleAsync(string selector) =>
        Assert.True(await Page.WaitForVisibleAsync(selector, Site.Timeout), $"{selector} should be visible");

    public async Task ExpectSelectorAsync(string selector) =>
        Assert.True(await Page.WaitForSelectorAsync(selector, Site.Timeout), $"{selector} should exist");

    /// <summary>Waits for the resource browser to finish restoring its state from the URL.</summary>
    public Task ExpectReadyAsync() => ExpectSelectorAsync("resource-browser[data-ready]");

    /// <summary>Waits for <paramref name="text"/> in the element's innerText, then checks it is the whole text.</summary>
    public async Task ExpectTextAsync(string selector, string text)
    {
        Assert.True(await Page.WaitForTextAsync(selector, text, Site.Timeout), $"{selector} should read \"{text}\"");
        Assert.Equal(text, Normalize(await Page.InnerTextAsync(selector)));
    }

    public async Task ExpectTextContainsAsync(string selector, string text) =>
        Assert.True(await Page.WaitForTextAsync(selector, text, Site.Timeout), $"{selector} should contain \"{text}\"");

    /// <summary>
    /// Waits for a visible <paramref name="selector"/> whose text contains <paramref name="name"/> and returns the
    /// selector, standing in for <c>getByRole(role, { name })</c> on controls that carry a stable attribute.
    /// </summary>
    public async Task<string> NamedAsync(string selector, string name)
    {
        await ExpectVisibleAsync(selector);
        await ExpectTextContainsAsync(selector, name);
        return selector;
    }

    private static string Normalize(string? text) => System.Text.RegularExpressions.Regex.Replace(text ?? "", "\\s+", " ").Trim();

    public Task ExpectFocusedAsync(string selector) =>
        ExpectAsync("arg => !!document.activeElement && document.activeElement === document.querySelector(arg.selector)", new { selector }, $"{selector} should be focused");

    public Task<int> CountAsync(string selector, bool visibleOnly = false) => Page.CountAsync(selector, visibleOnly);

    public async Task<string[]> AttributesAsync(string selector, string attribute) =>
        ((object?[]?)await Page.EvaluateAsync("arg => [...document.querySelectorAll(arg.selector)].map(e => e.getAttribute(arg.attribute))", new { selector, attribute }) ?? [])
        .Select(value => value?.ToString() ?? "").ToArray();

    public async Task<string[]> TextsAsync(string selector) =>
        (await Page.TextsAsync(selector)).Select(text => text.Trim()).ToArray();

    public async Task ClickAsync(string selector) => Assert.True(await Page.ClickAsync(selector), $"Could not click {selector}");

    public async ValueTask DisposeAsync()
    {
        await Page.CloseAsync();
        await context.DisposeAsync();
    }
}
