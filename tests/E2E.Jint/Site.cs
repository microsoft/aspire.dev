using System.Text.RegularExpressions;
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
        // MaxTaskDuration: a click scrolls its target into view, and on the browse page (about 700 cards) that layout
        // query can exceed the 5 s default on a CI runner. Chromium has no per-task ceiling.
        Browser = new Browser(new BrowserOptions { Viewport = new Viewport(1440, 900), MaxTaskDuration = TimeSpan.FromSeconds(30) });
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await Browser.DisposeAsync();
        Http.Dispose();
    }

    /// <summary>
    /// A new page in a new context, in the state of <c>emulateConsentNotRequiredRegion</c> (tests/e2e/helpers.ts):
    /// WCP requests fail, and the consent flag is cached as not required before the site's own scripts run.
    /// </summary>
    public async Task<SitePage> NewPageAsync()
    {
        var context = await Browser.NewContextAsync();
        await context.RouteAsync(uri => uri.Host.EndsWith("wcpstatic.microsoft.com", StringComparison.OrdinalIgnoreCase), request => request.AbortAsync());
        await context.AddInitScriptAsync("localStorage.setItem('aspireConsentRequired', 'false')");
        return new SitePage(context, await context.NewPageAsync());
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

/// <summary>
/// A page with the few Playwright-style assertions the ported specs need, each on a native Jint.Browser wait: they
/// observe mutations, URL changes and focus in .NET, so no JavaScript predicate is re-run in the page on every poll.
/// </summary>
public sealed class SitePage(BrowserContext context, Page page) : IAsyncDisposable
{
    public Page Page { get; } = page;

    public Task<PageResponse?> GotoAsync(string path) => Page.NavigateAsync(new Uri(Site.BaseUrl, path).ToString());

    public string Url => Page.Url.ToString();

    /// <summary>
    /// <c>expect(locator).toHaveText(array)</c>. Jint.Browser has no native list wait, so this polls
    /// <see cref="Page.TextsAsync"/>, one request per look, instead of a JavaScript predicate.
    /// </summary>
    public async Task ExpectTextsAsync(string target, string[] expected)
    {
        var deadline = DateTime.UtcNow + Site.Timeout;
        string[] actual;
        while (!(actual = await TextsAsync(target)).SequenceEqual(expected) && DateTime.UtcNow < deadline) await Task.Delay(50);
        Assert.Equal(expected, actual);
    }

    /// <summary><c>expect(page).toHaveURL(regex)</c>.</summary>
    public async Task ExpectUrlAsync(string pattern) =>
        Assert.True(await Page.WaitForUrlAsync(new Regex(pattern), Site.Timeout), $"URL should match /{pattern}/, was {Url}");

    /// <summary><c>expect(page).not.toHaveURL(regex)</c>.</summary>
    public async Task ExpectUrlNotAsync(string pattern)
    {
        var regex = new Regex(pattern);
        Assert.True(await Page.WaitForUrlAsync(uri => !regex.IsMatch(uri.ToString()), Site.Timeout), $"URL should not match /{pattern}/, was {Url}");
    }

    public async Task ExpectCountAsync(string target, int count) =>
        Assert.True(await Page.WaitForCountAsync(target, count, Site.Timeout), $"{target} should match {count} elements, found {await CountAsync(target)}");

    public async Task ExpectVisibleAsync(string target) =>
        Assert.True(await Page.WaitForVisibleAsync(target, Site.Timeout), $"{target} should be visible");

    public async Task ExpectSelectorAsync(string target) =>
        Assert.True(await Page.WaitForSelectorAsync(target, Site.Timeout), $"{target} should exist");

    /// <summary>Waits for the resource browser to finish restoring its state from the URL.</summary>
    public Task ExpectReadyAsync() => ExpectSelectorAsync("resource-browser[data-ready]");

    /// <summary>Waits for <paramref name="text"/> in the element's innerText, then checks it is the whole text.</summary>
    public async Task ExpectTextAsync(string target, string text)
    {
        Assert.True(await Page.WaitForTextAsync(target, text, Site.Timeout), $"{target} should read \"{text}\"");
        Assert.Equal(text, Normalize(await Page.InnerTextAsync(target)));
    }

    public async Task ExpectTextContainsAsync(string target, string text) =>
        Assert.True(await Page.WaitForTextAsync(target, text, Site.Timeout), $"{target} should contain \"{text}\"");

    /// <summary><c>expect(locator).toBeFocused()</c>.</summary>
    public async Task ExpectFocusedAsync(string target) =>
        Assert.True(await Page.WaitForFocusAsync(target, Site.Timeout), $"{target} should be focused");

    /// <summary>Waits until the attribute of the first match differs from <paramref name="value"/>.</summary>
    public async Task ExpectAttributeChangedAsync(string target, string attribute, string? value) =>
        Assert.True(await Page.WaitForAttributeAsync(target, attribute, new Regex($"^(?!{Regex.Escape(value ?? "")}$)"), Site.Timeout), $"{target} [{attribute}] should change from {value}");

    /// <summary><c>getByRole(role, { name, exact: true })</c>, in Playwright's locator syntax.</summary>
    public static string Role(string role, string name) => $"role={role}[name=\"{name}\"s]";

    private static string Normalize(string? text) => Regex.Replace(text ?? "", "\\s+", " ").Trim();

    public Task<int> CountAsync(string target, bool visibleOnly = false) => Page.CountAsync(target, visibleOnly);

    public async Task<string[]> AttributesAsync(string selector, string attribute) =>
        ((object?[]?)await Page.EvaluateAsync("arg => [...document.querySelectorAll(arg.selector)].map(e => e.getAttribute(arg.attribute))", new { selector, attribute }) ?? [])
        .Select(value => value?.ToString() ?? "").ToArray();

    public async Task<string[]> TextsAsync(string target) =>
        (await Page.TextsAsync(target)).Select(text => text.Trim()).ToArray();

    public async Task ClickAsync(string target) => Assert.True(await Page.ClickAsync(target), $"Could not click {target}");

    public async ValueTask DisposeAsync()
    {
        await Page.CloseAsync();
        await context.DisposeAsync();
    }
}
