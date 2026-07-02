var builder = DistributedApplication.CreateBuilder(args);

// For deployment: We want to pick AppService as the environment to publish to.
builder.AddAzureAppServiceEnvironment("production");

var frontend = builder.AddViteApp("frontend", "../../frontend")
    .WithPnpm();

var staticHostWebsite = builder.AddProject<Projects.StaticHost>("aspiredev")
    .WithExternalHttpEndpoints();

staticHostWebsite.PublishWithContainerFiles(frontend, "./wwwroot");

builder.AddAzureFrontDoor(staticHostWebsite);

if (builder.ExecutionContext.IsRunMode)
{
    // For local development: Use ViteApp for hot reload and development experience
    frontend.WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (Local)")
            .WithExternalHttpEndpoints();
}

builder.Build().Run();
