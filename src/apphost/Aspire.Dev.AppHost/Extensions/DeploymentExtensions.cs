using Aspire.Hosting.Azure;

#pragma warning disable ASPIRECOMPUTE001 // Type is for evaluation purposes only and is subject to change or removal in future updates. Suppress this diagnostic to proceed.

internal static class DeploymentExtensions
{
    public static IResourceBuilder<AzureFrontDoorResource> AddAzureFrontDoor(
        this IDistributedApplicationBuilder builder,
        [ResourceName] string name,
        IResourceBuilder<ProjectResource> appServiceWebsite)
    {
        var frontDoorName = $"{name}-afd";
        var frontdoor = new AzureFrontDoorResource(frontDoorName, "Bicep/front-door-appservice.bicep");

        return builder.AddResource(frontdoor)
            .WithParameter("frontDoorName", frontDoorName)
            .WithParameter("appServiceHostName", appServiceWebsite.Resource.Name);
    }
}

public sealed class AzureFrontDoorResource(string name, string? templateFile = null)
    : AzureBicepResource(name, templateFile: templateFile ?? "Bicep/front-door.bicep"), IComputeResource;

#pragma warning restore ASPIRECOMPUTE001 // Type is for evaluation purposes only and is subject to change or removal in future updates. Suppress this diagnostic to proceed.