namespace StaticHost.SiteFiles;

internal static class SiteFileExtensions
{
    public static IServiceCollection AddSiteFiles(this IServiceCollection services)
    {
        services.AddOptions<SiteFileCacheOptions>()
            .BindConfiguration(SiteFileCacheOptions.SectionName)
            .Validate(
                SiteFileCacheOptions.IsValid,
                $"{SiteFileCacheOptions.SectionName} needs non-empty values, and path prefixes that start with '/' and do not end with it.")
            .ValidateOnStart();

        return services.AddSingleton<SiteFileETags>();
    }

    /// <summary>
    /// Serves the web root's files, preferring the precompressed brotli copy. Call it after
    /// <c>UseRouting</c>: it leaves requests that matched an endpoint to that endpoint.
    /// </summary>
    public static IApplicationBuilder UseSiteFiles(this IApplicationBuilder app) =>
        app.UseMiddleware<SiteFileMiddleware>();
}
