using Microsoft.AspNetCore.Http.Extensions;

namespace StaticHost.Routing;

internal sealed class CanonicalPathRedirectMiddleware(
    RequestDelegate next,
    StaticWebRootIndex index)
{
    public Task InvokeAsync(HttpContext context)
    {
        if (!index.Current.Paths.TryResolve(context.Request.Path, out var canonicalPath))
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
