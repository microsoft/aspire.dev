var builder = DistributedApplication.CreateBuilder(args);

// For deployment: We want to pick AppService as the environment to publish to.
builder.AddAzureAppServiceEnvironment("production");

var staticHostWebsite = builder.AddProject<Projects.StaticHost>("aspiredev")
    .WithExternalHttpEndpoints();

builder.AddAzureFrontDoor(staticHostWebsite);

if (builder.ExecutionContext.IsRunMode)
{
    staticHostWebsite.WithLocalLiveStatusDevCommands();

    // For local development: Use ViteApp for hot reload and development experience.
    // The live-status client calls same-origin /api/live[/stream]; inject StaticHost's
    // origin so the Vite dev server can proxy those to the API (see astro.config.mjs).
    // Without this, /api/live 404s against the Vite origin under `aspire run`.
    builder.AddViteApp("frontend", "../../frontend")
           .WithPnpm()
           .WithEnvironment("ASPIRE_STATICHOST_URL", staticHostWebsite.GetEndpoint("https"))
           .WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (Local)")
           .WithExternalHttpEndpoints();
}
else
{
    staticHostWebsite.WithProductionLiveStatus(builder);
}

builder.Build().Run();
