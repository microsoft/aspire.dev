using System.Text;

namespace StaticHost.HybridApiDocs;

internal static class HybridApiDocsErrorPages
{
    private static readonly byte[] Unavailable = Encoding.UTF8.GetBytes("""
        <!doctype html><html lang="en"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>API reference temporarily unavailable | Aspire</title>
        <style>body{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#12111a;color:#e8e6f0}
        main{max-width:32rem;padding:2rem}a{display:inline-block;margin:1rem .75rem 0 0;padding:.6rem 1.2rem;border-radius:.5rem;background:#7455dd;color:#fff;text-decoration:none}
        a.quiet{background:none;border:1px solid #5a5675}</style></head>
        <body><main><h1>API reference temporarily unavailable</h1>
        <p>This page could not be loaded right now. Try again in a moment.</p>
        <a href="">Try again</a><a class="quiet" href="/docs/">Back to the docs</a></main></body></html>
        """);

    public static async Task WriteUnavailableAsync(HttpContext context, int statusCode)
    {
        var response = context.Response;
        response.StatusCode = statusCode;
        response.Headers.CacheControl = "no-store";
        response.Headers.RetryAfter = "5";
        response.ContentType = "text/html; charset=utf-8";
        response.ContentLength = Unavailable.Length;
        if (!HttpMethods.IsHead(context.Request.Method)) await response.Body.WriteAsync(Unavailable, context.RequestAborted);
    }
}
