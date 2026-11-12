using System.Diagnostics.Metrics;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddOpenTelemetry()
    .WithMetrics(m => m.AddMeter("AspireApp.ApiService"))
    .WithTracing(t => t.AddSource("AspireApp.ApiService"));

var app = builder.Build();
app.MapDefaultEndpoints();

var source = new System.Diagnostics.ActivitySource("AspireApp.ApiService");

// Multi-span trace (cache, database, message broker) so trace detail views look like a real workload.
app.MapGet("/orders/{id:int}", async (int id, ILogger<Program> logger) =>
{
    using (var a = source.StartActivity("GET orders:cache", System.Diagnostics.ActivityKind.Client))
    {
        a?.SetTag("db.system", "redis");
        a?.SetTag("db.operation", "GET");
        a?.SetTag("db.statement", $"GET order:{id}");
        a?.SetTag("server.address", "cache");
        a?.SetTag("server.port", 6379);
        await Task.Delay(Random.Shared.Next(2, 6));
        a?.AddEvent(new("cache.miss"));
    }
    using (var a = source.StartActivity("SELECT orders", System.Diagnostics.ActivityKind.Client))
    {
        a?.SetTag("db.system", "postgresql");
        a?.SetTag("db.name", "orders");
        a?.SetTag("db.operation", "SELECT");
        a?.SetTag("db.statement", "SELECT id, customer_id, total, status FROM orders WHERE id = @id");
        a?.SetTag("server.address", "db");
        a?.SetTag("server.port", 5432);
        await Task.Delay(Random.Shared.Next(15, 40));
    }
    using (var a = source.StartActivity("SELECT order_items", System.Diagnostics.ActivityKind.Client))
    {
        a?.SetTag("db.system", "postgresql");
        a?.SetTag("db.name", "orders");
        a?.SetTag("db.operation", "SELECT");
        a?.SetTag("db.statement", "SELECT sku, quantity, price FROM order_items WHERE order_id = @id");
        a?.SetTag("server.address", "db");
        a?.SetTag("server.port", 5432);
        await Task.Delay(Random.Shared.Next(8, 20));
    }
    using (var a = source.StartActivity("SET orders:cache", System.Diagnostics.ActivityKind.Client))
    {
        a?.SetTag("db.system", "redis");
        a?.SetTag("db.operation", "SET");
        a?.SetTag("db.statement", $"SET order:{id}");
        a?.SetTag("server.address", "cache");
        a?.SetTag("server.port", 6379);
        await Task.Delay(Random.Shared.Next(2, 5));
    }
    using (var a = source.StartActivity("orders publish", System.Diagnostics.ActivityKind.Producer))
    {
        a?.SetTag("messaging.system", "rabbitmq");
        a?.SetTag("messaging.destination.name", "order-viewed");
        a?.SetTag("messaging.operation", "publish");
        a?.SetTag("server.address", "messaging");
        a?.SetTag("server.port", 5672);
        await Task.Delay(Random.Shared.Next(4, 10));
    }
    logger.LogInformation("Loaded order {OrderId}", id);
    return new { Id = id, Status = "Shipped", Total = 42.5m + id };
});

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
