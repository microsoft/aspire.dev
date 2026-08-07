namespace StaticHost.Tests;

/// <summary>
/// Shared sample HTML/Markdown bodies and seed helpers for agent-readiness
/// middleware tests. Keeps <see cref="LinkHeaderTests"/> and
/// <see cref="MarkdownNegotiationTests"/> in lock-step on what a "Starlight
/// page" looks like on disk.
/// </summary>
internal static class SamplePages
{
    public const string Html = "<!doctype html><html><body>Hello</body></html>";
    public const string Markdown = "# Hello\n\nMarkdown body.";

    /// <summary>
    /// Seeds the on-disk shape produced by <c>starlight-page-actions</c> for a
    /// folder-style page: <c>{slug}/index.html</c> + sibling <c>{slug}.md</c>.
    /// </summary>
    public static void SeedFolderPage(TempWebRoot root, string slug)
    {
        root.WriteFile($"{slug}/index.html", Html);
        root.WriteFile($"{slug}.md", Markdown);
    }

    /// <summary>
    /// Seeds the root page: <c>/index.html</c> + <c>/index.md</c>.
    /// </summary>
    public static void SeedRoot(TempWebRoot root)
    {
        root.WriteFile("index.html", Html);
        root.WriteFile("index.md", Markdown);
    }
}
