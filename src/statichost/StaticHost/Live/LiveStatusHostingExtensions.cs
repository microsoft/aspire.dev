using Yarp.ReverseProxy.Configuration;

namespace StaticHost.Live;

internal enum LiveStatusHostingMode
{
    Coordinator,
    Proxy,
}

internal static class LiveStatusHostingExtensions
{
    internal const string ProxyRouteId = "live-status-proxy";
    internal const string ProxyClusterId = "live-status-coordinator";
    internal const string ProxyPath = "/api/live/{**remainder}";

    public static LiveStatusHostingMode AddLiveStatusHosting(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        var backendUrl = builder.Configuration[
            $"{LiveStatusOptions.SectionName}:{nameof(LiveStatusOptions.BackendUrl)}"];
        if (string.IsNullOrWhiteSpace(backendUrl))
        {
            builder.AddLiveStatus();
            return LiveStatusHostingMode.Coordinator;
        }

        var address = NormalizeBackendUrl(backendUrl);
        builder.Services.AddReverseProxy().LoadFromMemory(
            [
                new RouteConfig
                {
                    RouteId = ProxyRouteId,
                    ClusterId = ProxyClusterId,
                    Match = new RouteMatch { Path = ProxyPath },
                },
            ],
            [
                new ClusterConfig
                {
                    ClusterId = ProxyClusterId,
                    Destinations = new Dictionary<string, DestinationConfig>
                    {
                        ["coordinator"] = new() { Address = address },
                    },
                },
            ]);

        return LiveStatusHostingMode.Proxy;
    }

    public static void MapLiveStatusHosting(
        this WebApplication app,
        LiveStatusHostingMode mode)
    {
        ArgumentNullException.ThrowIfNull(app);

        if (mode is LiveStatusHostingMode.Proxy)
        {
            app.MapReverseProxy();
        }
        else
        {
            app.MapLiveStatus();
        }
    }

    private static string NormalizeBackendUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment) ||
            uri.AbsolutePath is not "/")
        {
            throw new InvalidOperationException(
                "Live:BackendUrl must be an HTTPS origin URL without a path, query, credentials, or fragment.");
        }

        return uri.GetLeftPart(UriPartial.Authority) + "/";
    }
}
