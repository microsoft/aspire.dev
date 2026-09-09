#:sdk Aspire.AppHost.Sdk@13.6.0-preview.1.26458.6
#:property AspireUseCliBundle=true

var builder = DistributedApplication.CreateBuilder(args);

builder.AddExecutable("web", "node", ".", "service.mjs")
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
