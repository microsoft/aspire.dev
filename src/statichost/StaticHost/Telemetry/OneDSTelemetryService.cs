namespace StaticHost.Telemetry;

/// <summary>
/// Service for tracking events to 1DS/Application Insights.
/// Uses the same instrumentation key as the client-side 1ds.js.
/// </summary>
internal sealed class OneDSTelemetryService(
    ILogger<OneDSTelemetryService> logger,
    IWebHostEnvironment hostEnvironment) : IDisposable
{
    private const string AspireDotDev = "https://aspire.dev";

    private static readonly ActivitySource s_downloadActivitySource = new(TelemetryConstants.AspireDotDevSource);

    private readonly ILogger<OneDSTelemetryService> _logger = logger;

    /// <summary>
    /// The 1DS analytics environment tag value expects one of two possible values:
    /// <list type=""bullet">
    /// <item><c>PROD</c> - for production deployments</item>
    /// <item><c>PPE</c> - for pre-production deployments</item>
    /// </list>
    /// </summary>
    private readonly string _environment = hostEnvironment.IsProduction() ? "PROD" : "PPE";

    public void Dispose()
    {
        s_downloadActivitySource.Dispose();
    }

    /// <summary>
    /// Tracks a download event for the specified script.
    /// </summary>
    /// <param name="context">The HTTP context for extracting request metadata.</param>
    /// <param name="scriptName">The name of the script being downloaded.</param>
    public void TrackDownload(HttpContext context, string scriptName)
    {
        var origin = $"{context.Request.Scheme}://{context.Request.Host}";

        // Skip tracking for non-production origins (matching 1ds.js behavior)
        if (_environment is not "PROD" ||
            !origin.Equals(AspireDotDev, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogSkippingTracking(origin);

            return;
        }

        try
        {
            using var activity = s_downloadActivitySource.StartActivity(
                TelemetryConstants.Activities.InstallScriptDownload, ActivityKind.Server);

            if (activity is not null)
            {
                activity.AddTag(TelemetryConstants.Tags.Behavior, "DOWNLOAD");
                activity.AddTag(TelemetryConstants.Tags.ClientIp, context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
                activity.AddTag(TelemetryConstants.Tags.Environment, _environment);
                activity.AddTag(TelemetryConstants.Tags.Origin, origin);
                activity.AddTag(TelemetryConstants.Tags.Referer, context.Request.Headers.Referer.ToString());
                activity.AddTag(TelemetryConstants.Tags.ScriptName, scriptName);
                activity.AddTag(TelemetryConstants.Tags.UserAgent, context.Request.Headers.UserAgent.ToString());
            
            
                _logger.LogTrackedEvent(TelemetryConstants.Activities.InstallScriptDownload);
            }
            else
            {
                _logger.LogActivityNotStarted(TelemetryConstants.Activities.InstallScriptDownload);
            }
        }
        catch (Exception ex)
        {
            _logger.LogTrackingFailed(TelemetryConstants.Activities.InstallScriptDownload, ex);
        }
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
        Message = "Activity not started for event: {EventName}")]
    internal static partial void LogActivityNotStarted(
        this ILogger logger, string eventName);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Failed to track event: {EventName}")]
    internal static partial void LogTrackingFailed(
        this ILogger logger, string eventName, Exception exception);
}