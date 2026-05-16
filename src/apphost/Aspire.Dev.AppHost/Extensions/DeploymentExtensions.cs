using Aspire.Hosting.Azure;
using Azure.Provisioning.Cdn;
using Azure.Provisioning.Expressions;

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
                // Preserve the Azure names previously used in the existing Bicep templates
                // to avoid unnecessary resources being deployed.

                var resources = infra.GetProvisionableResources();
                var uniqueStr = BicepFunction.GetUniqueString(BicepFunction.GetResourceGroup().Id);

                // Preserve the Premium SKU used by the previous Front Door deployment.
                var profile = resources.OfType<CdnProfile>().Single();
                profile.SkuName = CdnSkuName.PremiumAzureFrontDoor;
                profile.Name = BicepFunction.Take(BicepFunction.Interpolate($"frontdoor-afd{uniqueStr}"), 50);

                // Configure endpoint naming
                var frontDoorEndpoint = resources.OfType<FrontDoorEndpoint>().Single();
                frontDoorEndpoint.Name = BicepFunction.Take(BicepFunction.Interpolate($"frontdoor-afd-endp-{uniqueStr}"), 50);

                // Configure origin group naming
                var originGroup = resources.OfType<FrontDoorOriginGroup>().Single();
                originGroup.Name = BicepFunction.Take(BicepFunction.Interpolate($"appservice-origin-group-{uniqueStr}"), 50);

                // Configure origin naming
                var origin = resources.OfType<FrontDoorOrigin>().Single();
                origin.Name = BicepFunction.Take(BicepFunction.Interpolate($"appservice-origin-{uniqueStr}"), 50);
                origin.Weight = 1000;
                origin.EnforceCertificateNameCheck = true;

                // Configure route naming and caching
                var route = resources.OfType<FrontDoorRoute>().Single();
                route.Name = BicepFunction.Take(BicepFunction.Interpolate($"default-route-{uniqueStr}"), 50);
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
