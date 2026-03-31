var builder = DistributedApplication.CreateBuilder(args);

var extractionMode = builder.AddParameter("extraction-mode", value: "command-line");
var githubOAuthClientId = builder.AddParameter("github-oauth-client-id");
var githubOAuthClientSecret = builder.AddParameter("github-oauth-client-secret", secret: true);
var previewControlBaseUrl = builder.AddParameter("preview-control-base-url", value: string.Empty);
var previewContentBaseUrl = builder.AddParameter("preview-content-base-url", value: string.Empty);
var previewAuthCookieDomain = builder.AddParameter("preview-auth-cookie-domain", value: string.Empty);

var previewHost = builder.AddProject<Projects.PreviewHost>("previewhost")
    .PublishAsDockerFile()
    .WithExternalHttpEndpoints()
    .WithEnvironment("PreviewHost__ExtractionMode", extractionMode)
    .WithEnvironment("PreviewHost__GitHubOAuthClientId", githubOAuthClientId)
    .WithEnvironment("PreviewHost__GitHubOAuthClientSecret", githubOAuthClientSecret)
    .WithEnvironment("PreviewHost__ControlBaseUrl", previewControlBaseUrl)
    .WithEnvironment("PreviewHost__ContentBaseUrl", previewContentBaseUrl)
    .WithEnvironment("PreviewHost__AuthCookieDomain", previewAuthCookieDomain);

if (!string.IsNullOrWhiteSpace(builder.Configuration["PreviewHost:GitHubToken"]))
{
    var githubToken = builder.AddParameterFromConfiguration("github-token", "PreviewHost:GitHubToken", secret: true);
    previewHost.WithEnvironment("PreviewHost__GitHubToken", githubToken);
}
else
{
    var githubAppId = builder.AddParameter("github-app-id");
    var githubAppInstallationId = builder.AddParameter("github-app-installation-id");
    var githubAppPrivateKey = builder.AddParameter("github-app-private-key", secret: true);

    previewHost
        .WithEnvironment("PreviewHost__GitHubAppId", githubAppId)
        .WithEnvironment("PreviewHost__GitHubAppInstallationId", githubAppInstallationId)
        .WithEnvironment("PreviewHost__GitHubAppPrivateKey", githubAppPrivateKey);
}

if (!builder.ExecutionContext.IsRunMode)
{
    previewHost.WithEnvironment("PreviewHost__ContentRoot", "/tmp/pr-preview-data");
    builder.AddAzureAppServiceEnvironment("preview");
}

builder.Build().Run();
