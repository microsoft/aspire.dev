using Aspire.Hosting;
using Aspire.Hosting.Azure;

namespace Aspire.Dev.AppHost.Tests;

public sealed class LiveConfigurationTests
{
    [Fact]
    public async Task ProductionConfiguration_UsesParametersForConfigurationAndKeyVaultForSecrets()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions
        {
            Args = ["--publisher", "manifest"],
            DisableDashboard = true,
        });
        var siteSecrets = builder.AddAzureKeyVault("siteconfig");
        var cache = builder.AddAzureManagedRedis("livecache")
            .RunAsContainer();
        var website = builder.AddProject<Projects.StaticHost>("aspiredev")
            .WithReference(cache)
            .WithExternalHttpEndpoints()
            .WithProductionLiveStatus(builder, siteSecrets);
        await using var app = builder.Build();

        var redis = Assert.Single(builder.Resources.OfType<AzureManagedRedisResource>());
        Assert.Same(cache.Resource, redis);
        Assert.Equal("livecache", redis.Name);
        Assert.False(redis.UseAccessKeyAuthentication);
        Assert.Single(builder.Resources.OfType<ProjectResource>());

        var vault = Assert.Single(builder.Resources.OfType<AzureKeyVaultResource>());
        Assert.Same(siteSecrets.Resource, vault);
        Assert.Equal("siteconfig", vault.Name);
        Assert.Empty(builder.Resources.OfType<AzureKeyVaultSecretResource>());
        var template = vault.GetBicepTemplateString();
        Assert.Contains("Microsoft.KeyVault/vaults@", template, StringComparison.Ordinal);
        Assert.DoesNotContain("Microsoft.KeyVault/vaults/secrets", template, StringComparison.Ordinal);

        var expectedConfiguration = new Dictionary<string, string>
        {
            ["Live__PublicBaseUrl"] = "live-public-base-url",
            ["Live__CoalesceWindowMs"] = "live-coalesce-window-ms",
            ["Live__Twitch__ClientId"] = "live-twitch-client-id",
            ["Live__Twitch__ChannelLogin"] = "live-twitch-channel-login",
            ["Live__Twitch__ChannelId"] = "live-twitch-channel-id",
            ["Live__Twitch__ReconcileIntervalSeconds"] = "live-twitch-reconcile-interval-seconds",
            ["Live__YouTube__ChannelHandle"] = "live-youtube-channel-handle",
            ["Live__YouTube__ChannelId"] = "live-youtube-channel-id",
            ["Live__YouTube__PollingIntervalSeconds"] = "live-youtube-polling-interval-seconds",
            ["Live__YouTube__DiscoveryPollingIntervalSeconds"] = "live-youtube-discovery-polling-interval-seconds",
            ["Live__YouTube__OfflineConfirmationCount"] = "live-youtube-offline-confirmation-count",
        };
        var parameters = builder.Resources.OfType<ParameterResource>()
            .ToDictionary(parameter => parameter.Name);
        Assert.Equal(expectedConfiguration.Count, parameters.Count);
        Assert.All(parameters.Values, parameter => Assert.False(parameter.Secret));

        var environment = new Dictionary<string, object>();
        var context = new EnvironmentCallbackContext(
            builder.ExecutionContext, website.Resource, environment, CancellationToken.None);
        foreach (var annotation in website.Resource.Annotations.OfType<EnvironmentCallbackAnnotation>())
        {
            await annotation.Callback(context);
        }

        Assert.Contains("ConnectionStrings__livecache", environment);

        foreach (var (key, parameterName) in expectedConfiguration)
        {
            Assert.Same(parameters[parameterName], environment[key]);
        }

        var expectedSecrets = new Dictionary<string, string>
        {
            ["Live__Twitch__ClientSecret"] = "live-twitch-client-secret",
            ["Live__Twitch__WebhookSecret"] = "live-twitch-webhook-secret",
            ["Live__YouTube__ApiKey"] = "live-youtube-api-key",
            ["Live__YouTube__WebhookSecret"] = "live-youtube-webhook-secret",
        };
        Assert.Equal(
            expectedConfiguration.Count + expectedSecrets.Count,
            environment.Keys.Count(key => key.StartsWith("Live__", StringComparison.Ordinal)));
        foreach (var (key, secretName) in expectedSecrets)
        {
            var reference = Assert.IsAssignableFrom<IAzureKeyVaultSecretReference>(environment[key]);
            Assert.Equal(secretName, reference.SecretName);
            Assert.Same(vault, reference.Resource);
            Assert.Null(reference.SecretOwner);
        }

        var assignment = Assert.Single(
            website.Resource.Annotations.OfType<RoleAssignmentAnnotation>(),
            annotation => ReferenceEquals(annotation.Target, vault));
        Assert.Same(vault, assignment.Target);
        Assert.Equal("4633458b-17de-408a-b874-0445c86b69e6", Assert.Single(assignment.Roles).Id);

        Assert.Empty(
            website.Resource.Annotations.OfType<AzureAppServiceWebsiteCustomizationAnnotation>());
        Assert.Single(redis.Annotations.OfType<DefaultRoleAssignmentsAnnotation>());
    }
}
