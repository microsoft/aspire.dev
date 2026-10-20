using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace StaticHost.Tests;

/// <summary>
/// Builds an in-process server that uses the production forwarded-header wiring
/// ahead of the default-files middleware, so tests see the absolute URLs an App
/// Service origin behind Azure Front Door produces.
/// </summary>
internal sealed class ForwardedHeadersTestServer : IAsyncDisposable
{
    private readonly WebApplication _app;
    private readonly TempWebRoot _wwwroot;
    private readonly HttpClient _client;

    private ForwardedHeadersTestServer(WebApplication app, TempWebRoot wwwroot)
    {
        _app = app;
        _wwwroot = wwwroot;
        _client = app.GetTestClient();
    }

    /// <param name="frameworkForwardedHeaders">
    /// Mirrors ASPNETCORE_FORWARDEDHEADERS_ENABLED, which App Service and Aspire set in production.
    /// </param>
    public static async Task<ForwardedHeadersTestServer> StartAsync(bool frameworkForwardedHeaders = false)
    {
        var wwwroot = new TempWebRoot();
        try
        {
            wwwroot.WriteFile("docs/index.html", SamplePages.Html);

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                // An explicit value also overrides ASPNETCORE_FORWARDEDHEADERS_ENABLED in the environment.
                Args = [$"--FORWARDEDHEADERS_ENABLED={(frameworkForwardedHeaders ? "true" : "false")}"],
                ContentRootPath = wwwroot.Path,
                WebRootPath = wwwroot.Path,
            });
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            builder.AddForwardedClientIp();

            var app = builder.Build();
            app.UseForwardedClientIp();
            app.UseDefaultFiles();
            app.UseStaticFiles();
            app.MapGet("/echo", static (HttpContext context) =>
                $"{context.Request.Scheme}://{context.Request.Host}|{context.Connection.RemoteIpAddress}");

            await app.StartAsync();
            return new ForwardedHeadersTestServer(app, wwwroot);
        }
        catch
        {
            wwwroot.Dispose();
            throw;
        }
    }

    /// <summary>
    /// Sends a request the way Front Door does: the origin host name in the URL, the requested
    /// host in <c>X-Forwarded-Host</c>, and the client address in <c>X-Azure-ClientIP</c>.
    /// </summary>
    public async Task<HttpResponseMessage> GetAsync(
        string url,
        string? forwardedHost = null,
        string? clientIp = "203.0.113.7",
        string? forwardedProto = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        AddHeader(request, "X-Forwarded-Host", forwardedHost);
        AddHeader(request, "X-Azure-ClientIP", clientIp);
        AddHeader(request, "X-Forwarded-Proto", forwardedProto);

        return await _client.SendAsync(request);
    }

    private static void AddHeader(HttpRequestMessage request, string name, string? value)
    {
        if (value is not null)
        {
            request.Headers.Add(name, value);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _client.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
        _wwwroot.Dispose();
    }
}
