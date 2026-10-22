using Scalar.AspNetCore;
using StaticHost.HybridApiDocs;
using Microsoft.Extensions.FileProviders;

var hybridArtifactPath = new ConfigurationBuilder()
    .AddEnvironmentVariables().AddCommandLine(args).Build()["HybridApiDocs:ArtifactPath"];
var hybridArtifact = hybridArtifactPath is null ? null : HybridApiDocsArtifact.Load(hybridArtifactPath);
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = hybridArtifact?.ClientDirectory,
});
builder.Environment.RequireArtifact(builder.Configuration, hybridArtifact);

builder.AddServiceDefaults();
builder.AddForwardedClientIp();

// Production supplies the vault reference; local Aspire runs intentionally do not.
if (builder.Configuration.GetConnectionString("secrets") is not null)
{
    builder.Configuration.AddAzureKeyVaultSecrets("secrets");
}

builder.AddLiveStatus();

if (hybridArtifact is not null)
{
    var rendererUrls = builder.Configuration.GetSection("HybridApiDocs:RendererUrls").Get<string[]>()
        ?? [builder.Configuration["HybridApiDocs:RendererUrl"] ?? ""];
    builder.Services.AddHybridApiDocs(hybridArtifact, rendererUrls);
}

builder.Services.AddHsts(options =>
{
    options.Preload = true;
    options.IncludeSubDomains = true;
    options.MaxAge = TimeSpan.FromDays(180);
});

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddOpenApi("v1");
}

await using var app = builder.Build();
if (hybridArtifact is not null)
{
    var clientFiles = new PhysicalFileProvider(hybridArtifact.ClientDirectory);
    app.Environment.WebRootFileProvider = clientFiles;
    app.Lifetime.ApplicationStopped.Register(clientFiles.Dispose);
}

// Restore the Front Door client IP before telemetry or any middleware reads it.
app.UseForwardedClientIp();

// Only enable HSTS in production
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();

// Resolve request casing before any middleware rewrites or matches the static path.
if (hybridArtifact is not null)
{
    app.UseResponseCompression();
    app.UseHybridApiDocsRouting();
}
app.UseCanonicalPathRedirects();

// Agent-readiness middlewares MUST run before UseDefaultFiles + UseRouting:
//   * UseDefaultFiles rewrites /foo/ -> /foo/index.html, breaking .md-companion mapping.
//   * MapStaticAssets registers endpoints during UseRouting, so a path rewrite
//     after UseRouting wouldn't re-trigger endpoint selection.
// MarkdownNegotiationMiddleware short-circuits to serve the .md body directly;
// LinkHeaderMiddleware attaches a Link header on HTML 2xx responses via OnStarting.
app.UseAgentReadiness();

app.UseDefaultFiles();
if (hybridArtifact is not null)
{
    app.UseStaticFiles(HybridApiDocsExtensions.HybridStaticFileOptions());
}

// add routing after default files, so the default file middleware can modify the path first
app.UseRouting();

app.UseStatusCodePages(context => NotFoundPage.WriteAsync(context.HttpContext));

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

// Live-status API + SSE + webhooks.
app.MapLiveStatus();

// OpenAPI + Scalar API reference (with custom Aspire-brand theme) in dev.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference("/scalar/v1", options =>
    {
        options.WithTitle("aspire.dev API")
               .WithTheme(ScalarTheme.None);

        var brandPath = Path.Combine(AppContext.BaseDirectory, "aspire-brand.css");
        var themePath = Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "scalar", "aspire-theme.css");
        options.WithCustomCss(string.Concat(
            File.ReadAllText(brandPath),
            Environment.NewLine,
            File.ReadAllText(themePath)));
    });
}

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
if (hybridArtifact is not null) app.MapHybridApiDocs();

await app.RunAsync();
