namespace StaticHost.Routing;

public static class CanonicalPathRedirectExtensions
{
    private const string ResolverPropertyKey = "StaticHost.Routing.CanonicalPathResolver";

    /// <summary>
    /// Redirects case-insensitive static path matches to their exact on-disk casing.
    /// Call before middleware that rewrites or resolves the request path.
    /// </summary>
    public static IApplicationBuilder UseCanonicalPathRedirects(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.UseMiddleware<CanonicalPathRedirectMiddleware>(GetCanonicalPathResolver(app));
        return app;
    }

    /// <summary>
    /// Serves the default-locale page in place of untranslated locale routes, keeping the
    /// requested URL. Call after <see cref="UseCanonicalPathRedirects"/> and before the
    /// agent-readiness middlewares, <c>UseDefaultFiles</c>, and <c>UseRouting</c>.
    /// </summary>
    public static IApplicationBuilder UseLocaleFallback(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        var environment = app.ApplicationServices.GetRequiredService<IWebHostEnvironment>();
        var resolver = new LocaleFallbackResolver(
            GetCanonicalPathResolver(app),
            LocaleFallbackResolver.ReadLocales(GetWebRootPath(environment)));
        if (resolver.IsEnabled)
        {
            app.UseMiddleware<LocaleFallbackMiddleware>(resolver);
        }

        return app;
    }

    // Both middlewares share one index of the static files instead of enumerating the web root twice.
    private static CanonicalPathResolver GetCanonicalPathResolver(IApplicationBuilder app)
    {
        if (app.Properties.TryGetValue(ResolverPropertyKey, out var value) &&
            value is CanonicalPathResolver existing)
        {
            return existing;
        }

        var environment = app.ApplicationServices.GetRequiredService<IWebHostEnvironment>();
        var resolver = new CanonicalPathResolver(GetWebRootPath(environment));
        app.Properties[ResolverPropertyKey] = resolver;
        return resolver;
    }

    private static string GetWebRootPath(IWebHostEnvironment environment) =>
        environment.WebRootPath ??
        throw new InvalidOperationException("The static web root is not configured.");
}
