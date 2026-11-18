using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.Net.Http.Headers;

namespace StaticHost.Routing;

/// <summary>
/// Serves the default-locale (English) page in place of an untranslated locale route,
/// keeping the requested URL. See <see cref="LocaleFallbackResolver"/>.
/// </summary>
/// <remarks>
/// Rewrites <see cref="HttpRequest.Path"/>, so it MUST run before the agent-readiness
/// middlewares (which map the path to its <c>.md</c> companion), <c>UseDefaultFiles</c>,
/// and <c>UseRouting</c>.
/// </remarks>
internal sealed class LocaleFallbackMiddleware(RequestDelegate next, LocaleFallbackResolver resolver)
{
    private const string DefaultContentLanguage = "en";

    public Task InvokeAsync(HttpContext context)
    {
        var request = context.Request;
        if (!HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method))
        {
            return next(context);
        }

        var result = resolver.Resolve(request.Path);
        switch (result.Action)
        {
            case LocaleFallbackAction.Redirect:
                context.Response.Redirect(
                    UriHelper.BuildRelative(request.PathBase, result.Path, request.QueryString),
                    permanent: true,
                    preserveMethod: true);
                return Task.CompletedTask;

            case LocaleFallbackAction.Rewrite:
                request.Path = result.Path;
                context.Response.OnStarting(static state =>
                {
                    var response = (HttpResponse)state;
                    if (response.StatusCode is >= 200 and < 300)
                    {
                        response.Headers[HeaderNames.ContentLanguage] = DefaultContentLanguage;
                    }
                    return Task.CompletedTask;
                }, context.Response);
                return next(context);

            default:
                return next(context);
        }
    }
}
