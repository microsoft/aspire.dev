namespace StaticHost;

internal static class NotFoundPage
{
    /// <summary>Serves the site's 404 page for a response that is already a 404 with no body.</summary>
    public static async Task WriteAsync(HttpContext context)
    {
        var response = context.Response;
        if (response is not { StatusCode: 404, HasStarted: false }) return;

        var env = context.RequestServices.GetRequiredService<IWebHostEnvironment>();
        var notFoundPath = Path.Combine(env.WebRootPath ?? string.Empty, "404.html");
        if (!File.Exists(notFoundPath)) return;

        // Ensure the 404 page itself is not cached aggressively so new deployments update quickly
        response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        response.Headers.Pragma = "no-cache";
        response.Headers.Expires = "0";
        response.ContentType = "text/html; charset=utf-8";

        await response.SendFileAsync(notFoundPath);
    }
}
