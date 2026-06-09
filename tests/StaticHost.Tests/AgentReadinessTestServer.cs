using System.Net.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StaticHost.AgentReadiness;

namespace StaticHost.Tests;

/// <summary>
/// Builds an in-process ASP.NET Core test server that mirrors the production
/// pipeline order for the agent-readiness middlewares (markdown negotiation
/// and Link headers) without depending on the frontend build.
/// </summary>
internal sealed class AgentReadinessTestServer : IAsyncDisposable
{
    private readonly IHost _host;
    private readonly TestServer _testServer;
    private readonly TempWebRoot _wwwroot;

    public HttpClient Client { get; }

    public string WebRoot => _wwwroot.Path;

    private AgentReadinessTestServer(IHost host, TestServer testServer, TempWebRoot wwwroot)
    {
        _host = host;
        _testServer = testServer;
        _wwwroot = wwwroot;
        Client = testServer.CreateClient();
    }

    public static async Task<AgentReadinessTestServer> StartAsync(Action<TempWebRoot>? seed = null)
    {
        var wwwroot = new TempWebRoot();
        try
        {
            seed?.Invoke(wwwroot);

            var hostBuilder = Host.CreateDefaultBuilder()
                .ConfigureLogging(static logging => logging.ClearProviders())
                .ConfigureWebHost(web =>
                {
                    web.UseTestServer();
                    web.UseWebRoot(wwwroot.Path);
                    web.Configure(app =>
                    {
                        // Match production order: agent-readiness BEFORE
                        // UseDefaultFiles + UseRouting (see Program.cs).
                        app.UseAgentReadiness();
                        app.UseDefaultFiles();
                        app.UseStaticFiles();

                        // Endpoint that mimics MapStaticAssets fallback: 404 if
                        // no static asset matched.
                        app.Run(static ctx =>
                        {
                            ctx.Response.StatusCode = StatusCodes.Status404NotFound;
                            return Task.CompletedTask;
                        });
                    });
                });

            var host = hostBuilder.Build();
            await host.StartAsync();
            var testServer = host.GetTestServer();
            return new AgentReadinessTestServer(host, testServer, wwwroot);
        }
        catch
        {
            wwwroot.Dispose();
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        _testServer.Dispose();
        await _host.StopAsync();
        _host.Dispose();
        _wwwroot.Dispose();
    }
}

internal sealed class TempWebRoot : IDisposable
{
    public string Path { get; }

    public TempWebRoot()
    {
        Path = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(),
            $"aspire-agent-readiness-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path);
    }

    public void WriteFile(string relativePath, string contents)
    {
        var fullPath = System.IO.Path.Combine(Path, relativePath.TrimStart('/').Replace('/', System.IO.Path.DirectorySeparatorChar));
        var directory = System.IO.Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        File.WriteAllText(fullPath, contents);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(Path))
            {
                Directory.Delete(Path, recursive: true);
            }
        }
        catch (IOException)
        {
            // best-effort
        }
    }
}
