var builder = DistributedApplication.CreateBuilder(args);

var staticHostWebsite = builder.AddProject<Projects.StaticHost>("aspiredev")
    .PublishAsDockerFile()
    .WithExternalHttpEndpoints();

if (builder.ExecutionContext.IsRunMode)
{
    // Astro SSR server as a separate Node.js resource for local dev.
    var astroSsr = builder.AddNodeApp("astro-ssr", "dist/server/entry.mjs", "../../frontend")
        .WithHttpEndpoint(env: "ASTRO_DOTNET_PORT", name: "http");

    staticHostWebsite.WithReference(astroSsr)
        .WaitFor(astroSsr);

    builder.AddViteApp("frontend", "../../frontend")
           .WithPnpm()
           .WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (Local)")
           .WithExternalHttpEndpoints();
}
else
{
    var appService = builder.AddAzureAppServiceEnvironment("production");

    builder.AddAzureFrontDoor("frontdoor", staticHostWebsite);
}

builder.Build().Run();
