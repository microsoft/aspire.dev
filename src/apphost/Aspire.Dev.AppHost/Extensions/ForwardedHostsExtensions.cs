internal static class ForwardedHostsExtensions
{
    /// <summary>
    /// Sets the hosts StaticHost trusts in <c>X-Forwarded-Host</c>. Front Door calls the App Service
    /// origin with the origin's own host name, so without this StaticHost builds absolute URLs on
    /// the <c>*.azurewebsites.net</c> host. Local runs leave it unset, so StaticHost keeps the request host.
    /// </summary>
    public static IResourceBuilder<ProjectResource> WithProductionForwardedHosts(
        this IResourceBuilder<ProjectResource> staticHostWebsite,
        IDistributedApplicationBuilder builder)
    {
        // Separate hosts with ';' or ','. The apex is listed because '*.' only matches subdomains.
        var forwardedHosts = builder.AddParameter(
            "forwarded-hosts",
            "aspire.dev;*.aspire.dev",
            publishValueAsDefault: true);

        return staticHostWebsite.WithEnvironment("ForwardedHeaders__AllowedHosts", forwardedHosts);
    }
}
