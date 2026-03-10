using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AstroAdapter.AspNetCore;

/// <summary>
/// ASP.NET Core middleware that reverse-proxies requests to the Node.js
/// Astro SSR server for on-demand rendering. Falls through to the next
/// middleware when the SSR server returns 404 or is unavailable.
/// </summary>
public sealed class AstroSsrProxyMiddleware(
    RequestDelegate next,
    IHttpClientFactory httpClientFactory,
    AstroNodeProcess nodeProcess,
    IOptions<AstroOptions> options,
    ILogger<AstroSsrProxyMiddleware> logger)
{
    private static readonly HashSet<string> s_hopByHopHeaders = new(
        ["Connection", "Keep-Alive", "Transfer-Encoding", "TE", "Trailer", "Upgrade"],
        StringComparer.OrdinalIgnoreCase);

    public async Task InvokeAsync(HttpContext context)
    {
        // If endpoint routing already matched a handler (e.g. MapStaticAssets,
        // MapGet), let it run — don't proxy to SSR unnecessarily.
        if (context.GetEndpoint() is not null)
        {
            await next(context);
            return;
        }

        if (!nodeProcess.IsAvailable)
        {
            await next(context);
            return;
        }

        await nodeProcess.WaitForReadyAsync(context.RequestAborted);

        var ssrBase = options.Value.SsrBaseUrl?.TrimEnd('/')
                      ?? $"http://127.0.0.1:{nodeProcess.Port}";
        var targetUri = $"{ssrBase}{context.Request.Path}{context.Request.QueryString}";

        try
        {
            using var requestMessage = CreateProxyRequest(context.Request, targetUri);
            using var httpClient = httpClientFactory.CreateClient("AstroSsr");
            using var responseMessage = await httpClient.SendAsync(
                requestMessage,
                HttpCompletionOption.ResponseHeadersRead,
                context.RequestAborted);

            if (responseMessage.StatusCode == HttpStatusCode.NotFound)
            {
                // SSR server has no matching route — fall through to
                // the next middleware (e.g. custom 404 handling).
                await next(context);
                return;
            }

            await CopyProxyResponseAsync(context.Response, responseMessage, context.RequestAborted);
        }
        catch (HttpRequestException ex)
        {
            logger.LogDebug(ex, "SSR proxy request failed for {Path}, falling through", context.Request.Path);
            await next(context);
        }
        catch (TaskCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // Client disconnected — nothing to do.
        }
        catch (TaskCanceledException ex)
        {
            logger.LogWarning(ex, "SSR proxy request timed out for {Path}", context.Request.Path);
            if (!context.Response.HasStarted)
            {
                context.Response.StatusCode = StatusCodes.Status504GatewayTimeout;
            }
        }
    }

    private static HttpRequestMessage CreateProxyRequest(HttpRequest request, string targetUri)
    {
        var message = new HttpRequestMessage
        {
            Method = new HttpMethod(request.Method),
            RequestUri = new Uri(targetUri),
        };

        // Preserve the original Host so Astro generates correct URLs.
        message.Headers.Host = request.Host.Value;

        // Forward request headers, skipping hop-by-hop headers.
        foreach (var header in request.Headers)
        {
            if (s_hopByHopHeaders.Contains(header.Key)) continue;

            // Content-* headers belong on HttpContent, not the request.
            if (header.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase)) continue;

            message.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray());
        }

        // Copy request body when present.
        if (request.ContentLength > 0 || request.Headers.ContainsKey("Transfer-Encoding"))
        {
            message.Content = new StreamContent(request.Body);

            foreach (var header in request.Headers)
            {
                if (header.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase))
                {
                    message.Content.Headers.TryAddWithoutValidation(
                        header.Key, header.Value.ToArray());
                }
            }
        }

        // Standard forwarded headers so SSR knows the real client info.
        message.Headers.TryAddWithoutValidation("X-Forwarded-For",
            request.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1");
        message.Headers.TryAddWithoutValidation("X-Forwarded-Proto", request.Scheme);
        message.Headers.TryAddWithoutValidation("X-Forwarded-Host", request.Host.Value);

        return message;
    }

    private static async Task CopyProxyResponseAsync(
        HttpResponse response,
        HttpResponseMessage proxyResponse,
        CancellationToken cancellationToken)
    {
        response.StatusCode = (int)proxyResponse.StatusCode;

        foreach (var header in proxyResponse.Headers)
        {
            if (s_hopByHopHeaders.Contains(header.Key)) continue;
            response.Headers[header.Key] = header.Value.ToArray();
        }

        foreach (var header in proxyResponse.Content.Headers)
        {
            if (s_hopByHopHeaders.Contains(header.Key)) continue;
            response.Headers[header.Key] = header.Value.ToArray();
        }

        await proxyResponse.Content.CopyToAsync(response.Body, cancellationToken);
    }
}
