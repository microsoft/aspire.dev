using Aspire.Hosting.Azure;
using Azure.Provisioning.Cdn;
using Azure.Provisioning.Monitor;
using Azure.Provisioning.RedisEnterprise;

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

                // The route deliberately has no cache configuration, so Front Door sends every request to the
                // origin. StaticHost's redirects carry no Cache-Control, and Front Door would cache them for days.
            });
    }

    public static IResourceBuilder<AzureFrontDoorResource> WithDiagnostics(
        this IResourceBuilder<AzureFrontDoorResource> builder,
        IResourceBuilder<AzureLogAnalyticsWorkspaceResource> workspace)
    {
        return builder.ConfigureInfrastructure(infra =>
        {
            var profile = infra.GetProvisionableResources().OfType<CdnProfile>().Single();

            infra.Add(new DiagnosticSettingsResource("diagnostics")
            {
                Name = "security-logs",
                Scope = profile,
                Properties = new DiagnosticSettings
                {
                    WorkspaceId = workspace.Resource.Id.AsProvisioningParameter(infra),
                    Logs =
                    {
                        new DiagnosticsLogSettings
                        {
                            Category = "FrontDoorAccessLog",
                            Enabled = true
                        },
                        new DiagnosticsLogSettings
                        {
                            Category = "FrontDoorWebApplicationFirewallLog",
                            Enabled = true
                        }
                    }
                }
            });
        });
    }

    public static IResourceBuilder<AzureManagedRedisResource> WithDiagnostics(
        this IResourceBuilder<AzureManagedRedisResource> builder,
        IResourceBuilder<AzureLogAnalyticsWorkspaceResource> workspace)
    {
        return builder.ConfigureInfrastructure(infra =>
        {
            var database = infra.GetProvisionableResources().OfType<RedisEnterpriseDatabase>().Single();

            infra.Add(new DiagnosticSettingsResource("redisConnectionLogs")
            {
                Name = "redis-connection-logs",
                Scope = database,
                Properties = new DiagnosticSettings
                {
                    WorkspaceId = workspace.Resource.Id.AsProvisioningParameter(infra),
                    Logs =
                    {
                        new DiagnosticsLogSettings
                        {
                            Category = "ConnectionEvents",
                            Enabled = true
                        }
                    }
                }
            });
        });
    }
}
