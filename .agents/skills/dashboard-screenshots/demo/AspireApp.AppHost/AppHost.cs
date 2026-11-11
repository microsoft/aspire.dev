// Demo AppHost used only to produce documentation screenshots. Resource names mirror the
// `aspire-starter` template so the images match the docs narrative.
var builder = DistributedApplication.CreateBuilder(args);

// Containers give container-specific screenshots (container logs, type filters) a subject.
// The original docs images showed 5-8 resources, so the demo mirrors that scale.
builder.AddContainer("cache", "redis", "7.4");
builder.AddContainer("db", "postgres", "17")
    .WithEnvironment("POSTGRES_PASSWORD", "demo-only");
builder.AddContainer("messaging", "rabbitmq", "4");

var apiservice = builder.AddDotnetProject("apiservice", "../AspireApp.ApiService")
    .WithHttpHealthCheck("/health");

// Extra backends reuse the same project; they only exist to populate the dashboard.
builder.AddDotnetProject("inventoryservice", "../AspireApp.ApiService")
    .WithHttpHealthCheck("/health");
builder.AddDotnetProject("orderservice", "../AspireApp.ApiService")
    .WithHttpHealthCheck("/health");

builder.AddDotnetProject("webfrontend", "../AspireApp.Web")
    .WithExternalHttpEndpoints()
    .WithHttpHealthCheck("/health")
    .WithReference(apiservice)
    .WaitFor(apiservice);

builder.Build().Run();
