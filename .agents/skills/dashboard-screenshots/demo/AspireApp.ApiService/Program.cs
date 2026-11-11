using System.Diagnostics.Metrics;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddOpenTelemetry().WithMetrics(m => m.AddMeter("AspireApp.ApiService"));

var app = builder.Build();
app.MapDefaultEndpoints();

var meter = new Meter("AspireApp.ApiService");
var forecasts = meter.CreateCounter<int>("weather.forecasts.served", description: "Forecasts returned");
var summaries = new[] { "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching" };

app.MapGet("/weatherforecast", (ILogger<Program> logger) =>
{
    logger.LogInformation("Generating weather forecast for {Days} days", 5);
    var items = Enumerable.Range(1, 5).Select(i => new
    {
        Date = DateOnly.FromDateTime(DateTime.Now.AddDays(i)),
        TemperatureC = Random.Shared.Next(-20, 55),
        Summary = summaries[Random.Shared.Next(summaries.Length)]
    }).ToArray();
    forecasts.Add(items.Length, new KeyValuePair<string, object?>("region", "us-west"));
    return items;
});

// Always fails so the dashboard has error logs, failed spans and a failing trace to show.
app.MapGet("/forecast/unavailable", (ILogger<Program> logger) =>
{
    logger.LogWarning("Upstream weather provider timed out, retrying");
    logger.LogError("Weather provider unavailable for region {Region}", "eu-central");
    throw new InvalidOperationException("Weather provider unavailable.");
});

app.Run();
