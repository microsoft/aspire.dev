namespace StaticHost.Routing;

public static class CanonicalPathRedirectExtensions
{
    private const string IndexPropertyKey = "StaticHost.Routing.StaticWebRootIndex";

    /// <summary>
    /// Redirects case-insensitive static path matches to their exact on-disk casing.
    /// Call before middleware that rewrites or resolves the request path.
    /// </summary>
    public static IApplicationBuilder UseCanonicalPathRedirects(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.UseMiddleware<CanonicalPathRedirectMiddleware>(GetStaticWebRootIndex(app));
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

        app.UseMiddleware<LocaleFallbackMiddleware>(GetStaticWebRootIndex(app));
        return app;
    }

    // Both middlewares share one index of the static files instead of enumerating the web root twice.
    private static StaticWebRootIndex GetStaticWebRootIndex(IApplicationBuilder app)
    {
        if (app.Properties.TryGetValue(IndexPropertyKey, out var value) &&
            value is StaticWebRootIndex existing)
        {
            return existing;
        }

        var environment = app.ApplicationServices.GetRequiredService<IWebHostEnvironment>();
        var index = new StaticWebRootIndex(GetWebRootPath(environment));
        app.Properties[IndexPropertyKey] = index;
        return index;
    }

    private static string GetWebRootPath(IWebHostEnvironment environment) =>
        environment.WebRootPath ??
        throw new InvalidOperationException("The static web root is not configured.");
}
