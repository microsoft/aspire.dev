using Microsoft.Extensions.FileProviders;
using Microsoft.Net.Http.Headers;

namespace StaticHost.AgentReadiness;

/// <summary>
/// Adds an RFC 8288 <c>Link</c> response header advertising agent-discovery
/// resources on HTML responses (root + Starlight doc pages).
/// </summary>
/// <remarks>
/// <para>
/// The header is set via <c>Response.OnStarting</c> so we can inspect the final
/// <c>Content-Type</c> and <c>StatusCode</c> after downstream middleware /
/// endpoints have decided what to send. We only emit the header on 2xx
/// responses whose Content-Type starts with <c>text/html</c>; redirects, JSON
/// responses, static assets, and well-known JSON files are all skipped.
/// </para>
/// <para>
/// The middleware MUST run before <c>UseDefaultFiles</c> and <c>UseRouting</c>
/// so it can read the original request path. The decision about whether an
/// <c>.md</c> companion exists is made once per request, before any path
/// rewriting performed by <c>UseDefaultFiles</c>.
/// </para>
/// </remarks>
internal sealed class LinkHeaderMiddleware
{
    // Always-on links advertised on every HTML page.
    // Combined into a single Link header per RFC 8288 §3 (multiple values comma-separated).
    private static readonly string s_baseLinkHeader = string.Join(", ",
    [
        "</llms.txt>; rel=\"llms\"; type=\"text/plain\"",
        "</.well-known/agent-skills/index.json>; rel=\"agent-skills\"; type=\"application/json\"",
        "</sitemap-index.xml>; rel=\"sitemap\"; type=\"application/xml\""
    ]);

    private readonly RequestDelegate _next;
    private readonly IFileProvider _fileProvider;

    public LinkHeaderMiddleware(RequestDelegate next, IWebHostEnvironment env)
    {
        _next = next;
        _fileProvider = env.WebRootFileProvider;
    }

    public Task InvokeAsync(HttpContext context)
    {
        if (!ShouldHandle(context.Request))
        {
            return _next(context);
        }

        // Infrastructure paths (/_astro, /.well-known, /healthz, /install.*, /pagefind)
        // never need a Link header. The path list lives on MarkdownPathMapper so
        // both middlewares stay in lock-step.
        if (MarkdownPathMapper.IsInfrastructurePath(context.Request.Path))
        {
            return _next(context);
        }

        // Resolve the markdown companion against the ORIGINAL request path,
        // before UseDefaultFiles rewrites it to /foo/index.html.
        var companionPath = MarkdownPathMapper.TryGetMarkdownCompanion(
            context.Request.Path,
            _fileProvider);

        context.Response.OnStarting(static state =>
        {
            var ctx = (LinkHeaderState)state;
            var response = ctx.HttpContext.Response;

            // Only attach Link to successful HTML responses. Skip 3xx/4xx/5xx
            // and any non-HTML content type. This keeps redirects, JSON,
            // images, and static asset responses clean.
            if (response.StatusCode is < 200 or >= 300)
            {
                return Task.CompletedTask;
            }

            var contentType = response.ContentType;
            if (string.IsNullOrEmpty(contentType) ||
                !contentType.StartsWith("text/html", StringComparison.OrdinalIgnoreCase))
            {
                return Task.CompletedTask;
            }

            var header = ctx.CompanionPath is null
                ? s_baseLinkHeader
                : $"{s_baseLinkHeader}, <{ctx.CompanionPath}>; rel=\"alternate\"; type=\"text/markdown\"";

            // Append rather than overwrite so we cooperate with anything else
            // that may have set a Link header.
            response.Headers.Append(HeaderNames.Link, header);
            return Task.CompletedTask;
        }, new LinkHeaderState(context, companionPath));

        return _next(context);
    }

    private static bool ShouldHandle(HttpRequest request) =>
        HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method);

    private sealed record LinkHeaderState(HttpContext HttpContext, string? CompanionPath);
}
