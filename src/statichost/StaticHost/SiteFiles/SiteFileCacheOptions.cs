namespace StaticHost.SiteFiles;

/// <summary>
/// The <c>Cache-Control</c> values <see cref="SiteFileMiddleware"/> sends, bound from the
/// <c>SiteFiles:CacheControl</c> configuration section so they can be tuned with App Service
/// settings (for example <c>SiteFiles__CacheControl__Default</c>) and a restart, without a deploy.
/// </summary>
/// <remarks>
/// <para>
/// Every deployment purges Azure Front Door, so a file that is not fingerprinted can be cached at
/// the edge (<c>s-maxage</c>) while browsers revalidate it on every use (<c>max-age=0</c>): the
/// edge answers those revalidations, and a deployment's purge drops what it cached. Front Door
/// does not cache a response the origin marks <c>no-cache</c>, even with a rule that overrides
/// the cache duration, so the origin must send these values for HTML to be cached at the edge.
/// </para>
/// </remarks>
internal sealed class SiteFileCacheOptions
{
    public const string SectionName = "SiteFiles:CacheControl";

    // Browsers revalidate every time; Front Door keeps the response for an hour, or until the
    // purge that follows a deployment. An hour bounds how long a missed purge can serve stale HTML.
    internal const string DefaultValue = "public, max-age=0, must-revalidate, s-maxage=3600";

    // The SDK's default for images, video and fonts, as MapStaticAssets sent.
    internal const string MediaValue = "max-age=3600, must-revalidate";

    // https://starlight.astro.build/environmental-impact/#caching
    internal const string ImmutableValue = "max-age=31536000, public, immutable";

    /// <summary>The value for files that are neither media nor immutable: HTML, markdown, JSON, XML, text.</summary>
    public string Default { get; set; } = DefaultValue;

    /// <summary>The value for images, video and fonts outside the immutable paths.</summary>
    public string Media { get; set; } = MediaValue;

    /// <summary>The value for fingerprinted files, and for files requested with the version query parameter.</summary>
    public string Immutable { get; set; } = ImmutableValue;

    /// <summary>
    /// Paths whose files are fingerprinted, so they can be cached forever, separated by semicolons.
    /// Astro hashes the names of the files it emits under <c>/_astro/</c>. A string rather than a
    /// list, because configuration adds to a list's default instead of replacing it.
    /// </summary>
    public string ImmutablePathPrefixes { get; set; } = "/_astro";

    /// <summary>
    /// The query parameter that marks a URL as versioned (<c>sidebar.json?v=&lt;hash&gt;</c>), so its
    /// response can be cached forever: a new version gets a new URL. Empty turns it off.
    /// </summary>
    public string VersionQueryParameter { get; set; } = "v";

    internal string[] GetImmutablePathPrefixes() =>
        ImmutablePathPrefixes.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    internal static bool IsValid(SiteFileCacheOptions options) =>
        !string.IsNullOrWhiteSpace(options.Default)
        && !string.IsNullOrWhiteSpace(options.Media)
        && !string.IsNullOrWhiteSpace(options.Immutable)
        && options.GetImmutablePathPrefixes().All(static prefix => prefix is ['/', _, ..] && !prefix.EndsWith('/'));
}
