using Aspire.Hosting;
using Aspire.Hosting.Azure;
using Azure.Provisioning.AppService;

namespace Aspire.Dev.AppHost.Tests;

public sealed class HybridApiDocsConfigurationTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("""{"mode":"static","platform":"linux"}""")]
    [InlineData("""{"mode":"hybrid-api-docs","platform":"win32"}""")]
    public void PublishRejectsAMissingOrIncompatibleArtifact(string? manifest)
    {
        var directory = Path.Combine(Path.GetTempPath(), $"aspire-hybrid-invalid-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(directory, "dist-hybrid"));
        try
        {
            if (manifest is not null)
                File.WriteAllText(Path.Combine(directory, "dist-hybrid", "hybrid-api-docs.json"), manifest);
            var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions
            {
                Args = ["--publisher", "manifest"], DisableDashboard = true,
            });
            var website = builder.AddProject<Projects.StaticHost>("aspiredev");
            Assert.Throws<InvalidOperationException>(() => website.WithHybridApiDocs(builder, directory));
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
