namespace StaticHost.Routing;

/// <summary>
/// Marks every redirect the host sends <c>Cache-Control: no-store</c>.
/// </summary>
/// <remarks>
/// A redirect without <c>Cache-Control</c> is heuristically cacheable, and a permanent one is
/// cacheable by default (RFC 9111, 4.2.2). Azure Front Door would keep such a redirect for days,
/// so a canonical path, an HTTPS upgrade or an install script target that changes would go on
/// redirecting from the edge. Run it first, so it sees the redirects of every later middleware
/// and endpoint. 304 Not Modified is not a redirect and keeps the file's caching.
/// </remarks>
internal sealed class NoStoreRedirectMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(static state =>
        {
            var response = (HttpResponse)state;
            if (IsRedirect(response.StatusCode))
            {
                response.Headers.CacheControl = "no-store";
            }

            return Task.CompletedTask;
        }, context.Response);

        return next(context);
    }

    internal static bool IsRedirect(int statusCode) => statusCode
        is StatusCodes.Status301MovedPermanently
        or StatusCodes.Status302Found
        or StatusCodes.Status303SeeOther
        or StatusCodes.Status307TemporaryRedirect
        or StatusCodes.Status308PermanentRedirect;
}
