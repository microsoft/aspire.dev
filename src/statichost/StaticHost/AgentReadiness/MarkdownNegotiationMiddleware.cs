using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Net.Http.Headers;

namespace StaticHost.AgentReadiness;

/// <summary>
/// Serves the markdown companion of a Starlight HTML page when the client
/// prefers <c>text/markdown</c> via the <c>Accept</c> header.
/// </summary>
/// <remarks>
/// <para>
/// The site's static-asset pipeline emits a <c>.md</c> sibling next to every
/// HTML page (via <c>starlight-page-actions</c>). E.g. <c>/get-started/quickstart/</c>
/// has companion <c>/get-started/quickstart.md</c>. This middleware short-circuits
/// the pipeline by streaming that file directly when markdown is preferred —
/// it does NOT rewrite <c>Request.Path</c> because rewriting after
/// <c>UseRouting()</c> would not re-trigger endpoint selection in
/// <c>MapStaticAssets()</c>.
/// </para>
/// <para>
/// Therefore the middleware MUST run before <c>UseDefaultFiles</c> and
/// <c>UseRouting</c>. It operates on the original request path so it can compute
/// the companion <c>.md</c> mapping reliably (<c>UseDefaultFiles</c> would
/// otherwise have already turned <c>/foo/</c> into <c>/foo/index.html</c>).
/// </para>
/// <para>
/// To avoid <c>Vary: Accept</c> cache-key explosion at Azure Front Door, the
/// negotiated response sets <c>Cache-Control: private, max-age=0,
/// must-revalidate</c>. The HTML response is left untouched (no <c>Vary</c>
/// added) so HTML continues to cache normally.
/// </para>
/// </remarks>
internal sealed class MarkdownNegotiationMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IFileProvider _fileProvider;
    private readonly ILogger<MarkdownNegotiationMiddleware> _logger;

    public MarkdownNegotiationMiddleware(
        RequestDelegate next,
        IWebHostEnvironment env,
        ILogger<MarkdownNegotiationMiddleware> logger)
    {
        _next = next;
        _logger = logger;
        // Use the same provider MapStaticAssets reads from so wwwroot is the source of truth.
        _fileProvider = env.WebRootFileProvider;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!ShouldHandle(context.Request))
        {
            await _next(context);
            return;
        }

        // Infrastructure paths (e.g. /.well-known/*, /_astro/*, /healthz)
        // are NEVER subject to markdown negotiation — they have their own
        // content types and the agent might prefer markdown for the page
        // navigation but still expect JSON for these resources.
        if (MarkdownPathMapper.IsInfrastructurePath(context.Request.Path))
        {
            await _next(context);
            return;
        }

        var acceptHeader = context.Request.Headers.Accept.ToString();
        if (!AcceptHeaderParser.PrefersMarkdown(acceptHeader))
        {
            await _next(context);
            return;
        }

        var companionPath = MarkdownPathMapper.TryGetMarkdownCompanion(
            context.Request.Path,
            _fileProvider);
        if (companionPath is null)
        {
            // Markdown was preferred but no companion exists.
            // Fall back to HTML when it's acceptable; otherwise 406.
            if (AcceptHeaderParser.AcceptsHtml(acceptHeader))
            {
                await _next(context);
            }
            else
            {
                context.Response.StatusCode = StatusCodes.Status406NotAcceptable;
                context.Response.ContentType = "text/plain; charset=utf-8";
                await context.Response.WriteAsync(
                    "406 Not Acceptable: this resource is available as text/html or, where a companion exists, text/markdown.",
                    context.RequestAborted);
            }
            return;
        }

        var fileInfo = _fileProvider.GetFileInfo(companionPath);
        if (!fileInfo.Exists || fileInfo.IsDirectory)
        {
            // Race / inconsistency between MarkdownPathMapper.TryGetMarkdownCompanion
            // and the live file system. Fall through to default pipeline rather than 500.
            _logger.LogDebug(
                "Markdown companion {CompanionPath} reported but missing on disk; falling through.",
                companionPath);
            await _next(context);
            return;
        }

        WriteMarkdownHeaders(context, fileInfo);

        if (HttpMethods.IsHead(context.Request.Method))
        {
            // Send headers only; ASP.NET Core will flush them on response complete.
            return;
        }

        await context.Response.SendFileAsync(fileInfo, context.RequestAborted);
    }

    private static bool ShouldHandle(HttpRequest request) =>
        HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method);

    private static void WriteMarkdownHeaders(HttpContext context, IFileInfo fileInfo)
    {
        var response = context.Response;
        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = "text/markdown; charset=utf-8";
        response.ContentLength = fileInfo.Length;
        // Vary: Accept is the correct HTTP signal; combined with Cache-Control: private
        // it tells well-behaved CDNs (incl. Azure Front Door) NOT to cache this response,
        // avoiding cache-key explosion across many distinct Accept values.
        response.Headers.Vary = "Accept";
        response.Headers.CacheControl = "private, max-age=0, must-revalidate";
        response.Headers[HeaderNames.LastModified] =
            fileInfo.LastModified.UtcDateTime.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
    }
}
