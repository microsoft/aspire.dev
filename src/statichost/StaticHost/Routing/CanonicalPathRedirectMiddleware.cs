namespace StaticHost.Routing;

internal sealed class CanonicalPathRedirectMiddleware
{
    private readonly RequestDelegate _next;
    private readonly CanonicalPathResolver _resolver;

    public CanonicalPathRedirectMiddleware(
        RequestDelegate next,
        IWebHostEnvironment environment)
    {
        _next = next;
        _resolver = new CanonicalPathResolver(
            environment.WebRootPath ??
            throw new InvalidOperationException("The static web root is not configured."));
    }

    public Task InvokeAsync(HttpContext context)
    {
        if (!_resolver.TryResolve(context.Request.Path, out var canonicalPath))
        {
            return _next(context);
        }

        var location =
            context.Request.PathBase.Add(canonicalPath).ToUriComponent() +
            context.Request.QueryString.ToUriComponent();

        context.Response.Redirect(location, permanent: true, preserveMethod: true);
        return Task.CompletedTask;
    }
}
