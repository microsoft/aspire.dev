namespace StaticHost;

/// <summary>
/// Service for tracking events to 1DS/Application Insights.
/// Uses the same instrumentation key as the client-side 1ds.js.
/// </summary>
internal sealed class OneDSTelemetryService : IDisposable
{
    private readonly TelemetryClient _telemetryClient;
    private readonly TelemetryConfiguration _configuration;
    private readonly ILogger<OneDSTelemetryService> _logger;
    private readonly string _environment;

    // This key is intended to be public, same as in 1ds.js
    private const string InstrumentationKey = "1c6ad99c3e274af7881b9c3c78eed459-573e6b44-ab25-4e60-97ad-7b7f38f0243a-6923";

    public OneDSTelemetryService(
        ILogger<OneDSTelemetryService> logger,
        IWebHostEnvironment hostEnvironment)
    {
        _logger = logger;
        _environment = hostEnvironment.IsProduction() ? "PROD" : "PPE";

        _configuration = new TelemetryConfiguration
        {
            ConnectionString = $"InstrumentationKey={InstrumentationKey}"
        };

        _telemetryClient = new TelemetryClient(_configuration);
        _telemetryClient.Context.GlobalProperties["env"] = _environment;
    }

    /// <summary>
    /// Tracks a download event for the specified script.
    /// </summary>
    /// <param name="context">The HTTP context for extracting request metadata.</param>
    /// <param name="scriptName">The name of the script being downloaded.</param>
    public void TrackDownload(HttpContext context, string scriptName)
    {
        TrackEvent("Download", context, new Dictionary<string, string>
        {
            ["behavior"] = "DOWNLOAD",
            // ["actionType"] = "CL", - dot.net has this, but I think it implies user click, which is not the case for aspire.dev
            ["scriptName"] = scriptName
        });
    }

    /// <summary>
    /// Tracks a custom event with the specified name and properties.
    /// </summary>
    /// <param name="eventName">The name of the event to track.</param>
    /// <param name="context">The HTTP context for extracting request metadata.</param>
    /// <param name="additionalProperties">Optional additional properties to include with the event.</param>
    public void TrackEvent(
        string eventName,
        HttpContext context,
        IDictionary<string, string>? additionalProperties = null)
    {
        var origin = $"{context.Request.Scheme}://{context.Request.Host}";

        // Skip tracking for non-production origins (matching 1ds.js behavior)
        if (_environment is not "PROD" &&
            !origin.Equals("https://aspire.dev", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogSkippingTracking(origin);

            return;
        }

        try
        {
            var eventTelemetry = new EventTelemetry(eventName)
            {
                Properties =
                {
                    ["env"] = _environment,
                    ["userAgent"] = context.Request.Headers.UserAgent.ToString(),
                    ["referer"] = context.Request.Headers.Referer.ToString(),
                    ["origin"] = origin
                }
            };

            // Add client IP if available (for geographic insights)
            var clientIp = context.Connection.RemoteIpAddress?.ToString();
            if (!string.IsNullOrEmpty(clientIp))
            {
                eventTelemetry.Properties["clientIp"] = clientIp;
            }

            // Add any additional properties
            if (additionalProperties is not null)
            {
                foreach (var (key, value) in additionalProperties)
                {
                    eventTelemetry.Properties[key] = value;
                }
            }

            _telemetryClient.TrackEvent(eventTelemetry);

            _logger.LogTrackedEvent(eventName);
        }
        catch (Exception ex)
        {
            _logger.LogTrackingFailed(eventName, ex);
        }
    }

    public void Dispose()
    {
        _telemetryClient.Flush();
        _configuration.Dispose();
    }
}

internal static partial class Log
{
    [LoggerMessage(
        Level = LogLevel.Debug,
        Message = "[1ds] Skipping tracking for origin: {Origin}")]
    internal static partial void LogSkippingTracking(
        this ILogger logger, string origin);

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Tracked event: {EventName}")]
    internal static partial void LogTrackedEvent(
        this ILogger logger, string eventName);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Failed to track event: {EventName}")]
    internal static partial void LogTrackingFailed(
        this ILogger logger, string eventName, Exception exception);
}