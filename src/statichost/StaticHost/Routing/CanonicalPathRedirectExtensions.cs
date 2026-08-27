namespace StaticHost.Routing;

public static class CanonicalPathRedirectExtensions
{
    /// <summary>
    /// Redirects case-insensitive static path matches to their exact on-disk casing.
    /// Call before middleware that rewrites or resolves the request path.
    /// </summary>
    public static IApplicationBuilder UseCanonicalPathRedirects(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.UseMiddleware<CanonicalPathRedirectMiddleware>();
        return app;
    }
}
