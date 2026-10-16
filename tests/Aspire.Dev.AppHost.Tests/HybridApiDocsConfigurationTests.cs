using Aspire.Hosting;
using Aspire.Hosting.Azure;
using Azure.Provisioning.AppService;

namespace Aspire.Dev.AppHost.Tests;

public sealed class HybridApiDocsConfigurationTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData("0", false)]
    [InlineData("1", true)]
    public void BuildModeRequiresExplicitOptIn(string? value, bool expected)
        => Assert.Equal(expected, HybridApiDocsExtensions.IsHybridApiDocsEnabled(value));

    [Fact]
    public void InvalidBuildModeFailsClearly()
        => Assert.Throws<InvalidOperationException>(() => HybridApiDocsExtensions.IsHybridApiDocsEnabled("true"));

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LocalGraphUsesTwoPrivateWorkersAndEndpointReferences(bool externalArtifact)
    {
        var directory = Path.Combine(Path.GetTempPath(), $"aspire-hybrid-graph-{Guid.NewGuid():N}");
        var artifactDirectory = Path.Combine(directory, externalArtifact ? "artifact-windows" : "dist-hybrid");
        Directory.CreateDirectory(artifactDirectory);
        try
        {
            File.WriteAllText(Path.Combine(artifactDirectory, "hybrid-api-docs.json"),
                $$"""{"mode":"hybrid-api-docs","platform":"{{(OperatingSystem.IsWindows() ? "win32" : "linux")}}"}""");
            var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions
            {
                DisableDashboard = true,
            });
            if (externalArtifact) builder.Configuration["HybridApiDocsArtifactDirectory"] = artifactDirectory;
            var website = builder.AddProject<Projects.StaticHost>("aspiredev");
            website.WithHybridApiDocs(builder, directory);
            await using var app = builder.Build();
            var workers = builder.Resources.OfType<Aspire.Hosting.JavaScript.NodeAppResource>().ToArray();
            Assert.Equal(2, workers.Length);
            Assert.Equal(["api-docs", "api-docs-standby"], workers.Select(worker => worker.Name).ToArray());
            foreach (var worker in workers)
                Assert.All(worker.Annotations.OfType<Aspire.Hosting.ApplicationModel.EndpointAnnotation>(),
                    endpoint => Assert.False(endpoint.IsExternal));

            var environment = new Dictionary<string, object>();
            var context = new Aspire.Hosting.ApplicationModel.EnvironmentCallbackContext(
                builder.ExecutionContext, website.Resource, environment, CancellationToken.None);
            foreach (var annotation in website.Resource.Annotations
                .OfType<Aspire.Hosting.ApplicationModel.EnvironmentCallbackAnnotation>())
            {
                await annotation.Callback(context);
            }
            Assert.IsType<Aspire.Hosting.ApplicationModel.EndpointReference>(environment["HybridApiDocs__RendererUrls__0"]);
            Assert.IsType<Aspire.Hosting.ApplicationModel.EndpointReference>(environment["HybridApiDocs__RendererUrls__1"]);
            Assert.Equal(Path.Combine(artifactDirectory, "hybrid-api-docs.json"),
                environment["HybridApiDocs__ArtifactPath"]);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task PublishModelKeepsBothRenderersInsideTheSameWebsite()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"aspire-hybrid-sidecars-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(directory, "dist-hybrid"));
        try
        {
            File.WriteAllText(Path.Combine(directory, "dist-hybrid", "hybrid-api-docs.json"),
                """{"mode":"hybrid-api-docs","platform":"linux"}""");
            var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions
            {
                Args = ["--publisher", "manifest"], DisableDashboard = true,
            });
            var website = builder.AddProject<Projects.StaticHost>("aspiredev")
                .PublishAsAzureAppServiceWebsite((infra, site) => site.IsEndToEndEncryptionEnabled = true);
            website.WithHybridApiDocs(builder, directory);
            Assert.Empty(builder.Resources.OfType<Aspire.Hosting.JavaScript.NodeAppResource>());
            var image = Assert.Single(builder.Resources.OfType<ParameterResource>());
            Assert.Equal("api-docs-image", image.Name);

            var infrastructure = builder.AddAzureInfrastructure("hybrid-test", infra =>
            {
                var site = new WebSite("website") { Name = "hybrid-test", SiteConfig = new SiteConfigProperties() };
                infra.Add(site);
                infra.Add(new SiteContainer("mainContainer")
                {
                    Parent = site, Name = "main", IsMain = true, Image = "example/main:build",
                    AuthType = SiteContainerAuthType.UserAssigned,
                    UserManagedIdentityClientId = "00000000-0000-0000-0000-000000000000",
                });
                foreach (var annotation in website.Resource.Annotations.OfType<AzureAppServiceWebsiteCustomizationAnnotation>())
                    annotation.Configure(infra, site);

                var containers = infra.GetProvisionableResources().OfType<SiteContainer>().ToArray();
                Assert.Equal(3, containers.Length);
                var sidecars = containers.Where(container => !container.IsMain.Value).ToArray();
                Assert.Equal(2, sidecars.Length);
                Assert.All(sidecars, container =>
                {
                    Assert.Same(site, container.Parent);
                    Assert.False(container.InheritAppSettingsAndConnectionStrings.Value);
                    Assert.Empty(container.VolumeMounts);
                    Assert.Equal(SiteContainerAuthType.UserAssigned, container.AuthType.Value);
                    Assert.Equal("00000000-0000-0000-0000-000000000000", container.UserManagedIdentityClientId.Value);
                    var port = Assert.IsType<WebAppEnvironmentVariable>(Assert.Single(container.EnvironmentVariables).Value);
                    Assert.Equal("PORT", port.Name.Value);
                    // The value names an app setting (App Service does not treat it as a literal), so that
                    // setting must exist and carry this sidecar's own port.
                    Assert.Contains(site.SiteConfig.AppSettings, setting =>
                        setting.Value is { } pair &&
                        pair.Name.Value == port.Value.Value && pair.Value.Value == container.TargetPort.Value);
                });
                Assert.Equal(new string?[] { "4323", "4324" }, sidecars.Select(container => container.TargetPort.Value));
                Assert.Equal(2, sidecars.Select(container =>
                    Assert.IsType<WebAppEnvironmentVariable>(Assert.Single(container.EnvironmentVariables).Value).Value.Value).Distinct().Count());
                Assert.Equal("/healthz", site.SiteConfig.HealthCheckPath.Value);
                Assert.True(site.SiteConfig.IsAlwaysOn.Value);
                // The plan's instance count and scaling stay as configured on the existing production plan.
                Assert.True(site.IsEndToEndEncryptionEnabled.Value);
                Assert.Contains(site.SiteConfig.AppSettings, setting =>
                    setting.Value is { } pair &&
                    pair.Name.Value == "WEBSITE_HEALTHCHECK_MAXPINGFAILURES" && pair.Value.Value == "2");
                Assert.Contains(site.SiteConfig.AppSettings, setting =>
                    setting.Value is { } pair &&
                    pair.Name.Value == "WEBSITE_WARMUP_PATH" && pair.Value.Value == "/healthz/api-docs");
                Assert.Contains(site.SiteConfig.AppSettings, setting =>
                    setting.Value is { } pair &&
                    pair.Name.Value == "WEBSITE_WARMUP_STATUSES" && pair.Value.Value == "200");
            });
            await using var app = builder.Build();
            var bicep = infrastructure.Resource.GetBicepTemplateString();
            Assert.Contains("isMain: false", bicep, StringComparison.Ordinal);
            Assert.DoesNotContain("numberOfWorkers", bicep, StringComparison.Ordinal);
            Assert.Contains("healthCheckPath: '/healthz'", bicep, StringComparison.Ordinal);
            Assert.Contains("endToEndEncryptionEnabled: true", bicep, StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
