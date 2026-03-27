var builder = DistributedApplication.CreateBuilder(args);

var githubToken = builder.AddParameter("github-token", secret: true);
var registrationToken = builder.AddParameter("registration-token", secret: true);

builder.AddProject<Projects.PreviewHost>("previewhost")
    .WithExternalHttpEndpoints()
    .WithEnvironment("PreviewHost__GitHubToken", githubToken)
    .WithEnvironment("PreviewHost__RegistrationToken", registrationToken);

if (!builder.ExecutionContext.IsRunMode)
{
    builder.AddAzureAppServiceEnvironment("preview");
}

builder.Build().Run();
