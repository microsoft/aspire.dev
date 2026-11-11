var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHttpClient("apiservice", c => c.BaseAddress = new("https+http://apiservice"));
builder.Services.AddHostedService<TrafficGenerator>();

var app = builder.Build();
app.MapDefaultEndpoints();

app.MapGet("/", async (IHttpClientFactory factory) =>
    await factory.CreateClient("apiservice").GetStringAsync("/weatherforecast"));

app.Run();

// Produces a steady stream of traces, logs and metrics, including periodic failures.
sealed class TrafficGenerator(IHttpClientFactory factory, ILogger<TrafficGenerator> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var client = factory.CreateClient("apiservice");
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        for (var i = 0; !stoppingToken.IsCancellationRequested; i++)
        {
            try
            {
                // Only a few early failures so error badges stay small and realistic.
                var path = i is 5 or 17 or 29 ? "/forecast/unavailable" : "/weatherforecast";
                using var response = await client.GetAsync(path, stoppingToken);
                logger.LogInformation("GET {Path} returned {StatusCode}", path, (int)response.StatusCode);
                response.EnsureSuccessStatusCode();
            }
            catch (HttpRequestException ex)
            {
                logger.LogError(ex, "Request to apiservice failed");
            }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }
}
