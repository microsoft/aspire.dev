using System.Net;
using Microsoft.AspNetCore.ResponseCompression;

namespace StaticHost.HybridApiDocs;

internal static class HybridApiDocsExtensions
{
    public const string DevServerSetting = "HybridApiDocs:WebsiteServedByDevServer";

    /// <summary>
    /// The website is the prebuilt hybrid artifact, so StaticHost cannot start without one. The only exception is a
    /// Development run where the AppHost serves the website from the Vite dev server and StaticHost is API-only.
    /// </summary>
    public static void RequireArtifact(this IHostEnvironment environment, IConfiguration configuration,
        HybridApiDocsArtifact? artifact)
    {
        if (artifact is not null) return;
        if (environment.IsDevelopment() && configuration.GetValue<bool>(DevServerSetting)) return;
        throw new InvalidOperationException(
            "StaticHost requires the hybrid website artifact. Set HybridApiDocs:ArtifactPath to its hybrid-api-docs.json " +
            $"(only a Development run with {DevServerSetting}=true, as under the AppHost's Vite dev server, may omit it).");
    }
    public static void AddHybridApiDocs(this IServiceCollection services,
        HybridApiDocsArtifact artifact, string? rendererUrl)
        => services.AddHybridApiDocs(artifact, [rendererUrl ?? ""]);

    public static void AddHybridApiDocs(this IServiceCollection services,
        HybridApiDocsArtifact artifact, IEnumerable<string> rendererUrls)
    {
        var endpoints = rendererUrls.Select(value =>
        {
            if (!Uri.TryCreate(value, UriKind.Absolute, out var endpoint) ||
                endpoint.Scheme is not ("http" or "https") ||
                endpoint.UserInfo.Length > 0 || endpoint.Query.Length > 0 || endpoint.Fragment.Length > 0)
                throw new InvalidOperationException("HybridApiDocs:RendererUrls must specify private Astro worker endpoints.");
            return endpoint;
        }).Distinct().ToArray();
        if (endpoints.Length == 0)
            throw new InvalidOperationException("At least one private Astro worker endpoint is required.");
        // The hybrid client is served from plain files and renderer responses are forwarded
        // uncompressed, so neither has the build-time precompression of static web assets.
        services.AddResponseCompression(options =>
        {
            options.EnableForHttps = true;
            options.MimeTypes = ResponseCompressionDefaults.MimeTypes
                .Union(["text/javascript", "text/markdown", "image/svg+xml"]);
        });
        services.AddSingleton(artifact);
        services.AddSingleton(new HybridApiDocsEndpointPool(endpoints));
        services.AddSingleton<HybridApiDocsFlights>();
        services.AddHttpClient<HybridApiDocsRenderer>(client =>
        {
            client.Timeout = Timeout.InfiniteTimeSpan;
            client.MaxResponseContentBufferSize = HybridApiDocsRenderer.MaximumBodySize;
        }).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
        {
            UseProxy = false, UseCookies = false, AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.None,
            ConnectTimeout = TimeSpan.FromSeconds(5),
        });
    }

    public static void UseHybridApiDocsRouting(this IApplicationBuilder app)
        => app.UseMiddleware<HybridApiDocsRoutingMiddleware>();

    /// <summary>
    /// Serves the prebuilt client as plain files. Unlike static web assets, <c>UseStaticFiles</c> refuses
    /// extensions without a MIME mapping, which would drop Pagefind's index files and the terminal recordings.
    /// </summary>
    public static StaticFileOptions HybridStaticFileOptions() => new()
    {
        ServeUnknownFileTypes = true,
        DefaultContentType = "application/octet-stream",
        OnPrepareResponse = context =>
        {
            context.Context.Response.Headers.CacheControl =
                context.Context.Request.Path.StartsWithSegments("/_astro")
                    ? "public, max-age=31536000, immutable" : "no-cache";
        },
    };

    public static void MapHybridApiDocs(this IEndpointRouteBuilder app)
    {
        app.MapMethods("/reference/api/{**path}", ["GET", "HEAD"],
            (HttpContext context, HybridApiDocsRenderer renderer) => renderer.RenderAsync(context));
        app.MapMethods("/_image", ["GET", "HEAD"],
            (HttpContext context, HybridApiDocsRenderer renderer) => renderer.RenderAsync(context));
        app.MapGet("/healthz/api-docs", async (HttpContext context, HybridApiDocsRenderer renderer) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Results.StatusCode(await renderer.IsReadyAsync(context.RequestAborted)
                ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
        });
    }
}
