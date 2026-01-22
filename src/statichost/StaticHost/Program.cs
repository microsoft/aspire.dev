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
