using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Azure;
using Azure.Provisioning.AppService;

internal static class HybridApiDocsExtensions
{
    public static bool IsHybridApiDocsEnabled(string? value) => value switch
    {
        null or "0" => false,
        "1" => true,
        _ => throw new InvalidOperationException("ASPIRE_HYBRID_API_DOCS must be unset, 0, or 1."),
    };

    public static void WithHybridApiDocs(this IResourceBuilder<ProjectResource> website,
        IDistributedApplicationBuilder builder, string frontendDirectory)
    {
        var artifactDirectory = builder.Configuration["HybridApiDocsArtifactDirectory"]
            ?? Path.Combine(frontendDirectory, "dist-hybrid");
        var manifest = Path.GetFullPath(Path.Combine(artifactDirectory, "hybrid-api-docs.json"));
        if (!File.Exists(manifest))
            throw new InvalidOperationException($"Build or download the opted-in hybrid CI artifact: {manifest}");
        using var json = JsonDocument.Parse(File.ReadAllText(manifest));
        if (json.RootElement.GetProperty("mode").GetString() != "hybrid-api-docs")
            throw new InvalidOperationException("The selected artifact is not a hybrid API documentation build.");
        var platform = builder.ExecutionContext.IsRunMode
            ? OperatingSystem.IsWindows() ? "win32" : OperatingSystem.IsMacOS() ? "darwin" : "linux"
            : "linux";
        if (json.RootElement.GetProperty("platform").GetString() != platform)
            throw new InvalidOperationException($"The hybrid artifact must target {platform} for this execution mode.");

        if (builder.ExecutionContext.IsPublishMode)
        {
            var image = builder.AddParameter("api-docs-image");
            website.WithEnvironment("HybridApiDocs__ArtifactPath", "/app/hybrid/hybrid-api-docs.json");
            for (var index = 0; index < 2; index++)
            {
                var endpoint = $"http://127.0.0.1:{4323 + index}";
                website.WithEnvironment($"HybridApiDocs__RendererUrls__{index}", endpoint);
            }
            website.PublishAsAzureAppServiceWebsite((infra, site) =>
            {
                site.SiteConfig.IsAlwaysOn = true;
                // Renderer readiness only gates warmup; a renderer outage must not make the instance unhealthy.
                site.SiteConfig.HealthCheckPath = "/healthz";
                site.SiteConfig.AppSettings.Add(new AppServiceNameValuePair
                {
                    Name = "WEBSITE_HEALTHCHECK_MAXPINGFAILURES", Value = "2",
                });
                site.SiteConfig.AppSettings.Add(new AppServiceNameValuePair
                {
                    Name = "WEBSITE_WARMUP_PATH", Value = "/healthz/api-docs",
                });
                site.SiteConfig.AppSettings.Add(new AppServiceNameValuePair
                {
                    Name = "WEBSITE_WARMUP_STATUSES", Value = "200",
                });
                var main = infra.GetProvisionableResources().OfType<SiteContainer>()
                    .Single(container => ReferenceEquals(container.Parent, site) && container.IsMain.Value);
                for (var index = 0; index < 2; index++)
                {
                    // A sidecar environment variable's value names an app setting; it is not a literal.
                    var portSetting = $"API_DOCS_PORT_{index}";
                    site.SiteConfig.AppSettings.Add(new AppServiceNameValuePair
                    {
                        Name = portSetting, Value = $"{4323 + index}",
                    });
                    var sidecar = new SiteContainer($"apiDocs{index}")
                    {
                        Parent = site,
                        Name = index == 0 ? "api-docs" : "api-docs-standby",
                        Image = image.Resource.AsProvisioningParameter(infra),
                        IsMain = false,
                        TargetPort = $"{4323 + index}",
                        AuthType = main.AuthType,
                        UserManagedIdentityClientId = main.UserManagedIdentityClientId,
                        InheritAppSettingsAndConnectionStrings = false,
                    };
                    sidecar.EnvironmentVariables.Add(new WebAppEnvironmentVariable { Name = "PORT", Value = portSetting });
                    infra.Add(sidecar);
                }
            });
            return;
        }

        for (var index = 0; index < 2; index++)
        {
            var worker = builder.AddNodeApp(index == 0 ? "api-docs" : "api-docs-standby", frontendDirectory, "scripts/serve-api-docs.mjs")
                .WithPnpm(install: false)
                .WithHttpEndpoint(env: "PORT")
                .WithEnvironment("HOST", "127.0.0.1")
                .WithEnvironment("NODE_OPTIONS", "--max-old-space-size=1024")
                .WithEnvironment("HYBRID_API_DOCS_MANIFEST", manifest)
                .WithHttpHealthCheck("/__hybrid-api-docs/health");
            website.WithEnvironment($"HybridApiDocs__RendererUrls__{index}", worker.GetEndpoint("http"));
        }
        website.WithEnvironment("HybridApiDocs__ArtifactPath", manifest)
            .WithHttpHealthCheck("/healthz/api-docs");
    }
}
