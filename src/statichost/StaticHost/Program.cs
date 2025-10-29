using Microsoft.AspNetCore.StaticFiles;

var builder = WebApplication.CreateBuilder(args);

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
        var name = ctx.File.Name.ToLowerInvariant();

        // Astro hashes CSS/JS files, but HTML files should not be cached
        // They'll always reference the hashed assets
        if (name.EndsWith(".html") || name.EndsWith(".htm"))
        {
            headers.CacheControl = "no-cache, no-store, must-revalidate";
            headers.Pragma = "no-cache";
            headers.Expires = "0";
        }
        else if (name.EndsWith(".css") || name.EndsWith(".js")
            || name.EndsWith(".jpg") || name.EndsWith(".jpeg")
            || name.EndsWith(".png") || name.EndsWith(".gif")
            || name.EndsWith(".svg") || name.EndsWith(".webp")
            || name.EndsWith(".woff") || name.EndsWith(".woff2")
            || name.EndsWith(".ttf") || name.EndsWith(".eot"))
        {
            headers.CacheControl = "public, max-age=31536000, immutable";
        }
    }
});

app.MapGet("/healthz", () => Results.Ok());

app.MapGet("/install.ps1", async context =>
{
    context.Response.Redirect("https://aka.ms/aspire/get/install.ps1");
});

app.MapGet("/install.sh", async context =>
{
    context.Response.Redirect("https://aka.ms/aspire/get/install.sh");
});

app.MapStaticAssets();

await app.RunAsync();
