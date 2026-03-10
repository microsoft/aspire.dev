using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;

namespace AstroAdapter.AspNetCore;

public static class ApplicationBuilderExtensions
{
    /// <summary>
    /// Adds the full Astro middleware pipeline: static file serving for
    /// prerendered content, then SSR proxy for on-demand routes.
    /// </summary>
    public static IApplicationBuilder UseAstro(this IApplicationBuilder app)
    {
        var options = app.ApplicationServices.GetRequiredService<IOptions<AstroOptions>>().Value;
        var clientPath = Path.GetFullPath(options.ResolvedClientPath);

        if (Directory.Exists(clientPath))
        {
            var fileProvider = new PhysicalFileProvider(clientPath);

            // Rewrite directory requests to index.html (e.g. /getting-started/ → /getting-started/index.html)
            app.UseDefaultFiles(new DefaultFilesOptions
            {
                FileProvider = fileProvider,
            });

            // Serve prerendered pages and static assets from dist/client/
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = fileProvider,
                ServeUnknownFileTypes = false,
                OnPrepareResponse = ctx =>
                {
                    // Astro hashed assets get immutable cache headers (1 year).
                    if (ctx.Context.Request.Path.StartsWithSegments("/_astro"))
                    {
                        ctx.Context.Response.Headers.CacheControl =
                            "public, max-age=31536000, immutable";
                    }
                },
            });
        }

        // Proxy any request that didn't match a static file to the SSR server.
        app.UseMiddleware<AstroSsrProxyMiddleware>();

        return app;
    }

    /// <summary>
    /// Adds only the Astro static file middleware for serving prerendered content.
    /// Use this when you want to handle SSR routing separately.
    /// </summary>
    public static IApplicationBuilder UseAstroStaticFiles(this IApplicationBuilder app)
    {
        var options = app.ApplicationServices.GetRequiredService<IOptions<AstroOptions>>().Value;
        var clientPath = Path.GetFullPath(options.ResolvedClientPath);

        if (!Directory.Exists(clientPath)) return app;

        var fileProvider = new PhysicalFileProvider(clientPath);

        app.UseDefaultFiles(new DefaultFilesOptions
        {
            FileProvider = fileProvider,
        });

        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = fileProvider,
            ServeUnknownFileTypes = false,
            OnPrepareResponse = ctx =>
            {
                if (ctx.Context.Request.Path.StartsWithSegments("/_astro"))
                {
                    ctx.Context.Response.Headers.CacheControl =
                        "public, max-age=31536000, immutable";
                }
            },
        });

        return app;
    }

    /// <summary>
    /// Adds only the Astro SSR proxy middleware.
    /// Use this when you handle static files separately.
    /// </summary>
    public static IApplicationBuilder UseAstroSsr(this IApplicationBuilder app)
    {
        app.UseMiddleware<AstroSsrProxyMiddleware>();
        return app;
    }
}
