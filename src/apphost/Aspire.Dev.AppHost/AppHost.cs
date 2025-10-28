var builder = DistributedApplication.CreateBuilder(args);

// Add Ev2 environment support for 1P deployment
builder.AddEv2Environment();
//builder.AddOneBranchPipeline();

var staticHostWebsite = builder.AddProject<Projects.StaticHost>("aspiredev")
    .WithExternalHttpEndpoints();

if (builder.ExecutionContext.IsRunMode)
{
    // For local development: Use ViteApp for hot reload and development experience
    builder.AddViteApp("frontend", "../../frontend")
           .WithNpmPackageInstallation()
           .WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (Local)")
           .WithExternalHttpEndpoints();
}
else
{
    // For deployment: We want to pick ACA as the environment to publish to.
    var appService = builder.AddAzureAppServiceEnvironment("production");

    builder.AddAzureFrontDoor("frontdoor", staticHostWebsite);
}

builder.Build().Run();
