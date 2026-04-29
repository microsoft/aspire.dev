var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

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

// Astro emits SSG redirects as tiny HTML files. Convert them to HTTP redirects
// from the ASP.NET host so crawlers and link checkers do not see 404/200 pages.
app.Use(async (context, next) =>
{
    var redirectTarget = TryGetAstroRedirectTarget(context);
    if (redirectTarget is not null)
    {
        Redirect(context, redirectTarget);
        return;
    }

    if (ShouldRedirectToTrailingSlash(context))
    {
        Redirect(context, $"{context.Request.Path}/{context.Request.QueryString}");
        return;
    }

    await next();
});

app.UseDefaultFiles();

// add routing after default files, so the default file middleware can modify the path first
app.UseRouting();

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

// Ensure text/plain responses include UTF-8 charset to fix encoding issues with .txt files
app.Use(async (context, next) =>
{
    // Fixes https://github.com/microsoft/aspire.dev/issues/300
    context.Response.OnStarting(() =>
    {
        if (context.Response.ContentType is "text/plain")
        {
            context.Response.ContentType = "text/plain; charset=utf-8";
        }
        return Task.CompletedTask;
    });

    await next();
});

app.MapGet("/healthz", () => Results.Ok());

app.MapGet("/install.ps1", (HttpContext context, OneDSTelemetryService telemetry) =>
{
    telemetry.TrackDownload(context, "install.ps1");

    return Results.Redirect("https://aka.ms/aspire/get/install.ps1");
});

app.MapGet("/install.sh", (HttpContext context, OneDSTelemetryService telemetry) =>
{
    telemetry.TrackDownload(context, "install.sh");

    return Results.Redirect("https://aka.ms/aspire/get/install.sh");
});

app.MapStaticAssets();

await app.RunAsync();

static void Redirect(HttpContext context, string location)
{
    context.Response.StatusCode = StatusCodes.Status308PermanentRedirect;
    context.Response.Headers.Location = location;
}

static bool ShouldRedirectToTrailingSlash(HttpContext context)
{
    var path = context.Request.Path.Value;

    if (string.IsNullOrEmpty(path) ||
        path.EndsWith('/') ||
        Path.HasExtension(path))
    {
        return false;
    }

    var fileInfo = GetIndexFileInfo(context);

    return fileInfo.Exists;
}

static string? TryGetAstroRedirectTarget(HttpContext context)
{
    var path = context.Request.Path.Value;
    if (!string.IsNullOrEmpty(path) && Path.HasExtension(path))
    {
        return null;
    }

    var fileInfo = GetIndexFileInfo(context);

    if (!fileInfo.Exists || fileInfo.Length > 2048)
    {
        return null;
    }

    using var stream = fileInfo.CreateReadStream();
    using var reader = new StreamReader(stream);
    var content = reader.ReadToEnd();

    const string titlePrefix = "<title>Redirecting to: ";
    const string titleSuffix = "</title>";

    var start = content.IndexOf(titlePrefix, StringComparison.OrdinalIgnoreCase);
    if (start < 0)
    {
        return null;
    }

    start += titlePrefix.Length;
    var end = content.IndexOf(titleSuffix, start, StringComparison.OrdinalIgnoreCase);
    if (end < 0)
    {
        return null;
    }

    var target = content[start..end];
    if (string.IsNullOrWhiteSpace(target))
    {
        return null;
    }

    target = System.Net.WebUtility.HtmlDecode(target);

    if (!context.Request.QueryString.HasValue)
    {
        return target;
    }

    var separator = target.Contains('?') ? '&' : '?';
    return $"{target}{separator}{context.Request.QueryString.Value.TrimStart('?')}";
}

static Microsoft.Extensions.FileProviders.IFileInfo GetIndexFileInfo(HttpContext context)
{
    var path = context.Request.Path.Value;
    var relativePath = string.IsNullOrEmpty(path) || path == "/"
        ? "index.html"
        : path.TrimStart('/').TrimEnd('/') + "/index.html";

    var env = context.RequestServices.GetRequiredService<IWebHostEnvironment>();

    return env.WebRootFileProvider.GetFileInfo(relativePath);
}
