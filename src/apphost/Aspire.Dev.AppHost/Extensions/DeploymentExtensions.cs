using Aspire.Hosting.Azure;
using Azure.Provisioning.Cdn;

internal static class DeploymentExtensions
{
    public static IResourceBuilder<AzureFrontDoorResource> AddAzureFrontDoor(
        this IDistributedApplicationBuilder builder,
        IResourceBuilder<ProjectResource> appServiceWebsite)
    {
        return builder.AddAzureFrontDoor("frontdoor-afd")
            .WithOrigin(appServiceWebsite)
            .ConfigureInfrastructure(infra =>
            {
                var resources = infra.GetProvisionableResources();

                var origin = resources.OfType<FrontDoorOrigin>().Single();
                origin.Weight = 1000;
                origin.EnforceCertificateNameCheck = true;

                var route = resources.OfType<FrontDoorRoute>().Single();
                route.CacheConfiguration = new FrontDoorRouteCacheConfiguration
                {
                    CompressionSettings = new RouteCacheCompressionSettings
                    {
                        IsCompressionEnabled = true,
                        ContentTypesToCompress =
                        {
                            "text/plain",
                            "text/html",
                            "text/css",
                            "application/javascript",
                            "application/json",
                            "image/svg+xml"
                        }
                    },
                    QueryStringCachingBehavior = FrontDoorQueryStringCachingBehavior.IgnoreQueryString
                };
            });
    }
}
