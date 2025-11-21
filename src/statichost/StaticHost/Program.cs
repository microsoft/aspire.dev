using Microsoft.AspNetCore.StaticFiles;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHsts(options =>
{
    options.Preload = true;
    options.IncludeSubDomains = true;
    options.MaxAge = TimeSpan.FromDays(180);
});

await using var app = builder.Build();

// Only enable HSTS in production
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseDefaultFiles();

app.UseStatusCodePages(async context =>
{
    var response = context.HttpContext.Response;
    if (response is { StatusCode: 404, HasStarted: false })
    {
        var env = context.HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>();

        var notFoundPath = Path.Combine(env.WebRootPath ?? string.Empty, "404.html");

        if (File.Exists(notFoundPath))
        {
            // Ensure the 404 page itself is not cached aggressively so new deployments update quickly
            response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            response.Headers.Pragma = "no-cache";
            response.Headers.Expires = "0";
            response.ContentType = "text/html; charset=utf-8";

            await response.SendFileAsync(notFoundPath);
        }
    }
});

var provider = new FileExtensionContentTypeProvider();
provider.Mappings[".cast"] = "application/x-asciinema+json";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = provider,
    OnPrepareResponse = ctx =>
    {
        var headers = ctx.Context.Response.Headers;

        // Anything served from the /_astro/ directory can be cached forever
        // https://starlight.astro.build/environmental-impact/#caching
        if (IsInAstroDirectory(ctx.File.PhysicalPath))
        {
            headers.CacheControl = "public, max-age=604800, immutable";
            return;
        }

        if (ctx.File.IsDirectory)
        {
            return;
        }

        var extension = Path.GetExtension(ctx.File.Name).ToLowerInvariant();

        // Astro hashes CSS/JS files, but HTML files should not be cached
        // They'll always reference the hashed assets
        if (extension is ".html" or ".htm")
        {
            headers.CacheControl = "no-cache, no-store, must-revalidate";
            headers.Pragma = "no-cache";
            headers.Expires = "0";
        }
        else if (extension is ".css" or ".js"
            or ".mp4" or ".webm"
            or ".json" or ".xml"
            or ".jpg" or ".jpeg" 
            or ".png" or ".gif" 
            or ".svg" or ".webp" 
            or ".woff" or ".woff2" 
            or ".ttf" or ".eot")
        {
            headers.CacheControl = "public, max-age=604800, immutable";
        }

        static bool IsInAstroDirectory(string? path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            var directorySegments = path.Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar)
                .Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);

            return directorySegments.Any(s => s.Equals("_astro", StringComparison.OrdinalIgnoreCase));
        }
    }
});

app.MapGet("/healthz", () => Results.Ok());

app.MapGet("/install.ps1", async context =>
{
    await Task.CompletedTask;
    context.Response.Redirect("https://aka.ms/aspire/get/install.ps1");
});

app.MapGet("/install.sh", async context =>
{
    await Task.CompletedTask;
    context.Response.Redirect("https://aka.ms/aspire/get/install.sh");
});

app.MapStaticAssets();

await app.RunAsync();
