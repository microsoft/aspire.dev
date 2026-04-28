var builder = DistributedApplication.CreateBuilder(args);

var staticHostWebsite = builder.AddProject<Projects.StaticHost>("aspiredev")
    .WithExternalHttpEndpoints();

if (builder.ExecutionContext.IsRunMode)
{
    staticHostWebsite
        .WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (StaticHost)")
        .WithUrls(ctx =>
        {
            if (ctx.Resource is not Aspire.Hosting.ApplicationModel.IResourceWithEndpoints withEndpoints)
            {
                return;
            }
            var endpoint = withEndpoints.GetEndpoint("http");
            if (endpoint is null)
            {
                return;
            }
            ctx.Urls.Add(new() { Url = "/api/live",                  DisplayText = "Live status (JSON)",       Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/api/live/stream",           DisplayText = "Live status (SSE stream)", Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/api/live/twitch/webhook",   DisplayText = "Twitch EventSub webhook",  Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/api/live/youtube/webhook",  DisplayText = "YouTube WebSub webhook",   Endpoint = endpoint });
            ctx.Urls.Add(new() { Url = "/scalar/v1",                 DisplayText = "API reference (Scalar)",   Endpoint = endpoint });
        });

    // For local development: Use ViteApp for hot reload and development experience
    builder.AddViteApp("frontend", "../../frontend")
           .WithPnpm()
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
