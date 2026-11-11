// Demo AppHost used only to produce documentation screenshots. Resource names mirror the
// `aspire-starter` template so the images match the docs narrative.
var builder = DistributedApplication.CreateBuilder(args);

var apiservice = builder.AddDotnetProject("apiservice", "../AspireApp.ApiService")
    .WithHttpHealthCheck("/health");

builder.AddDotnetProject("webfrontend", "../AspireApp.Web")
    .WithExternalHttpEndpoints()
    .WithHttpHealthCheck("/health")
    .WithReference(apiservice)
    .WaitFor(apiservice);

builder.Build().Run();
