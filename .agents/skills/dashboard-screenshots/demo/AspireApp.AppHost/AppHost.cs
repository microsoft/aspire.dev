using Microsoft.Extensions.DependencyInjection;

#pragma warning disable ASPIRETERMINAL001

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

// Optional profiles for shots that need a different app model (set DEMO_PROFILE before `bun scripts/run.ts`).
var profile = Environment.GetEnvironmentVariable("DEMO_PROFILE");

if (profile == "replicas")
{
    builder.AddDotnetProject("catalogservice", "../AspireApp.ApiService")
        .WithReplicas(2);
}

if (profile == "terminal")
{
    var dir = builder.AppHostDirectory;

    builder.AddExecutable("dev-shell", "pwsh", dir, "-NoLogo", "-NoProfile", "-NoExit", "-File", "terminal-session.ps1")
        .WithTerminal()
        .WithCommand("open-dock", "Open terminal dock", async context =>
        {
            var terminals = context.Services.GetRequiredService<TerminalService>();

            var workspace = terminals.CreateTerminal(new TerminalLaunchOptions
            {
                Title = "Workspace",
                Executable = "pwsh",
                Arguments = ["-NoLogo", "-NoProfile"],
                WorkingDirectory = dir,
                Placement = TerminalPlacement.Dock
            });
            var checks = terminals.CreateTerminal(new TerminalLaunchOptions
            {
                Title = "Catalog checks",
                Executable = "pwsh",
                Arguments = ["-NoLogo", "-NoProfile"],
                WorkingDirectory = dir,
                Placement = TerminalPlacement.Dock
            });

            workspace.Start();
            checks.Start();
            await Task.Delay(2500);
            await checks.SendTextAsync("function prompt { 'PS demo> ' }; Clear-Host\r");
            await workspace.SendTextAsync("function prompt { 'PS demo> ' }; Clear-Host\r");
            await Task.Delay(500);
            await checks.SendTextAsync("./check-catalog.ps1\r");
            await workspace.SendTextAsync("Get-Content ./workspace/products.json -Raw | ConvertFrom-Json | Format-Table Name, Stock\r");
            await Task.Delay(1500);
            checks.Show();

            return CommandResults.Success();
        });
}

builder.Build().Run();
