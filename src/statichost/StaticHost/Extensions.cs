using Microsoft.AspNetCore.HttpOverrides;
using OpenTelemetry.Instrumentation.AspNetCore;

namespace Microsoft.Extensions.Hosting;

public static class Extensions
{
    /// <summary>
    /// Azure Front Door overwrites <c>X-Azure-ClientIP</c> with the client socket IP,
    /// so it stays a single trustworthy entry even when App Service appends its own
    /// <c>X-Forwarded-For</c> hop.
    /// </summary>
    public const string FrontDoorClientIpHeader = "X-Azure-ClientIP";

    public static TBuilder AddForwardedClientIp<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Services.Configure<ForwardedHeadersOptions>(static options =>
        {
            options.ForwardedHeaders |= ForwardedHeaders.XForwardedFor;
            options.ForwardedForHeaderName = FrontDoorClientIpHeader;
            options.ForwardLimit = 1;
            // Front Door and App Service front-end addresses are not fixed. A request that
            // bypasses Front Door can spoof this header, so use the value for telemetry and
            // diagnostics, not for authorization.
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });

        return builder;
    }

    /// <summary>
    /// Adds forwarded-header processing unless ASPNETCORE_FORWARDEDHEADERS_ENABLED
    /// already added it, so a forwarded value is never consumed twice.
    /// </summary>
    public static IApplicationBuilder UseForwardedClientIp(this WebApplication app)
    {
        if (!app.Configuration.GetValue<bool>("FORWARDEDHEADERS_ENABLED"))
        {
            app.UseForwardedHeaders();
        }

        return app;
    }

    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();

        builder.Services.AddSingleton<OneDSTelemetryService>();

        return builder;
    }

    private static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .UseAzureMonitor(static options =>
            {
                options.ConnectionString = TelemetryConstants.AzureMonitorConnectionString;
            });

        // Long-lived SSE requests would otherwise dominate request duration telemetry
        // (App Insights "Server response time") with connection lifetimes, not latency.
        builder.Services.Configure<AspNetCoreTraceInstrumentationOptions>(static options =>
        {
            options.Filter = static context =>
                !context.Request.Path.StartsWithSegments("/api/live/stream", StringComparison.OrdinalIgnoreCase);
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddSource(
                        builder.Environment.ApplicationName,
                        TelemetryConstants.AspireDotDevSource
                    )
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation();
            });

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        var useOtlpExporter = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }
}