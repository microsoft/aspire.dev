namespace StaticHost.Telemetry;

/// <summary>
/// Contains constants for telemetry tag names and event names used by the <c>aspire.dev</c> static host.
/// </summary>
internal static class TelemetryConstants
{
    /// <summary>
    /// The activity source name for <c>aspire.dev</c> events.
    /// </summary>
    public const string AspireDotDevSource = "Aspire.Dev";

    /// <summary>
    /// The Azure Monitor connection string used for 1DS/Application Insights telemetry.
    /// </summary>
    public const string AzureMonitorConnectionString = $"InstrumentationKey={InstrumentationKey}";

    /// <summary>
    /// The instrumentation key used for 1DS/Application Insights telemetry.
    /// </summary>
    /// <remarks>
    /// This key is the same as the one used in the client-side 1ds.js.
    /// It's not considered a secret. For more information, see: <a href="https://learn.microsoft.com/azure/azure-monitor/app/connection-strings"></a>
    /// </remarks>
    public const string InstrumentationKey = "1c6ad99c3e274af7881b9c3c78eed459-573e6b44-ab25-4e60-97ad-7b7f38f0243a-6923";

    /// <summary>
    /// Tag names for telemetry data.
    /// </summary>
    internal static class Tags
    {
        /// <summary>
        /// Tag indicating the behavior associated with the event.
        /// </summary>
        public const string Behavior = "behavior";

        /// <summary>
        /// Tag indicating the name of the script being downloaded.
        /// </summary>
        public const string ScriptName = "script_name";

        /// <summary>
        /// Tag indicating the deployment environment.
        /// </summary>
        public const string Environment = "env";

        /// <summary>
        /// Tag indicating the user agent of the request.
        /// </summary>
        public const string UserAgent = "request_user_agent";

        /// <summary>
        /// Tag indicating the referer of the request.
        /// </summary>
        public const string Referer = "request_referer";

        /// <summary>
        /// Tag indicating the origin of the request.
        /// </summary>
        public const string Origin = "request_origin";

        /// <summary>
        /// Tag indicating the client IP address of the request.
        /// </summary>
        public const string ClientIp = "request_client_ip";
    }

    /// <summary>
    /// Activity names for telemetry.
    /// </summary>
    internal static class Activities
    {
        /// <summary>
        /// Activity name for the install script download.
        /// </summary>
        public const string InstallScriptDownload = "aspire.dev/install_script/download";
    }
}