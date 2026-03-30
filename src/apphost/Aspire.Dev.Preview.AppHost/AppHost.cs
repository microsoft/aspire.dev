var builder = DistributedApplication.CreateBuilder(args);

var registrationToken = builder.AddParameter("registration-token", secret: true);

var previewHost = builder.AddProject<Projects.PreviewHost>("previewhost")
    .WithExternalHttpEndpoints()
    .WithEnvironment("PreviewHost__RegistrationToken", registrationToken);

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
    builder.AddAzureAppServiceEnvironment("preview");
}

builder.Build().Run();
