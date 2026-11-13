using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
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

    /// <summary>
    /// What the AppHost sets for deployments. The tests pin the key and value instead of
    /// referencing StaticHost, because they are the contract between the two.
    /// </summary>
    public const string DeployedForwardedHosts = "aspire.dev;*.aspire.dev";

    /// <param name="frameworkForwardedHeaders">
    /// Mirrors ASPNETCORE_FORWARDEDHEADERS_ENABLED, which App Service and Aspire set in production.
    /// </param>
    /// <param name="forwardedHosts">
    /// The <c>ForwardedHeaders:AllowedHosts</c> value, set through the <c>ForwardedHeaders__AllowedHosts</c>
    /// environment variable in deployments. Pass <see langword="null"/> to leave it unset, as in local runs.
    /// </param>
    /// <param name="configureForwardedHeaders">
    /// Options set by other startup code before the production wiring runs.
    /// </param>
    public static async Task<ForwardedHeadersTestServer> StartAsync(
        bool frameworkForwardedHeaders = false,
        string? forwardedHosts = DeployedForwardedHosts,
        Action<ForwardedHeadersOptions>? configureForwardedHeaders = null)
    {
        var wwwroot = new TempWebRoot();
        try
        {
            wwwroot.WriteFile("docs/index.html", SamplePages.Html);

            // An explicit value also overrides ASPNETCORE_FORWARDEDHEADERS_ENABLED in the environment.
            var args = new List<string> { $"--FORWARDEDHEADERS_ENABLED={(frameworkForwardedHeaders ? "true" : "false")}" };
            if (forwardedHosts is not null)
            {
                args.Add($"--ForwardedHeaders:AllowedHosts={forwardedHosts}");
            }

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = [.. args],
                ContentRootPath = wwwroot.Path,
                WebRootPath = wwwroot.Path,
            });
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            if (configureForwardedHeaders is not null)
            {
                builder.Services.Configure(configureForwardedHeaders);
            }

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
