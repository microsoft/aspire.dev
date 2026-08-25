using Microsoft.AspNetCore.Http.Extensions;

namespace StaticHost.Routing;

internal sealed class CanonicalPathRedirectMiddleware(
    RequestDelegate next,
    IWebHostEnvironment environment)
{
    private readonly CanonicalPathResolver _resolver = new(
        environment.WebRootPath ??
        throw new InvalidOperationException("The static web root is not configured."));

    public Task InvokeAsync(HttpContext context)
    {
        if (!_resolver.TryResolve(context.Request.Path, out var canonicalPath))
        {
            return next(context);
        }

        context.Response.Redirect(
            UriHelper.BuildRelative(
                context.Request.PathBase,
                canonicalPath,
                context.Request.QueryString),
            permanent: true,
            preserveMethod: true);
        return Task.CompletedTask;
    }
}
