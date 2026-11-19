using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StaticHost.Routing;

namespace StaticHost.Tests;

public sealed class NoStoreRedirectTests
{
    [Theory]
    [InlineData("/DIAGNOSTICS/ASPIRE001/")]
    [InlineData("/SCRIPTS/SITE.JS?v=1")]
    public async Task Canonical_path_redirects_are_not_stored(string path)
    {
        await using var server = await AgentReadinessTestServer.StartAsync(root =>
        {
            root.WriteFile("diagnostics/aspire001/index.html", SamplePages.Html);
            root.WriteFile("scripts/site.js", "console.log('Aspire');");
        });

        using var response = await server.Client.GetAsync(path);

        Assert.Equal(HttpStatusCode.PermanentRedirect, response.StatusCode);
        Assert.Equal("no-store", response.Headers.NonValidated["Cache-Control"].ToString());
    }

    [Theory]
    [InlineData("/install.ps1", HttpStatusCode.Found)]
    [InlineData("/permanent", HttpStatusCode.MovedPermanently)]
    [InlineData("/cached", HttpStatusCode.PermanentRedirect)]
    public async Task Endpoint_redirects_are_not_stored(string path, HttpStatusCode status)
    {
        using var host = await StartAsync(static app =>
        {
            app.UseNoStoreRedirects();
            app.UseRouting();
            app.UseEndpoints(static endpoints =>
            {
                endpoints.MapGet("/install.ps1", () => Results.Redirect("https://aka.ms/aspire/get/install.ps1"));
                endpoints.MapGet("/permanent", () => Results.Redirect("/elsewhere", permanent: true));
                // A redirect that sets its own caching still must not be stored.
                endpoints.MapGet("/cached", (HttpContext context) =>
                {
                    context.Response.Headers.CacheControl = "public, max-age=86400";
                    return Results.Redirect("/elsewhere", permanent: true, preserveMethod: true);
                });
            });
        });
        using var client = host.GetTestClient();

        using var response = await client.GetAsync(path);

        Assert.Equal(status, response.StatusCode);
        Assert.Equal("no-store", response.Headers.NonValidated["Cache-Control"].ToString());
    }

    [Fact]
    public async Task Https_redirects_are_not_stored()
    {
        using var host = await StartAsync(static app =>
        {
            app.UseNoStoreRedirects();
            app.UseHttpsRedirection();
            app.Run(static context => context.Response.WriteAsync("ok"));
        }, static services => services.AddHttpsRedirection(static options => options.HttpsPort = 443));
        using var client = host.GetTestClient();

        using var response = await client.GetAsync("http://localhost/docs/");

        Assert.Equal(HttpStatusCode.TemporaryRedirect, response.StatusCode);
        Assert.Equal("no-store", response.Headers.NonValidated["Cache-Control"].ToString());
    }

    [Fact]
    public async Task Other_responses_keep_their_caching()
    {
        using var host = await StartAsync(static app =>
        {
            app.UseNoStoreRedirects();
            app.Run(static context =>
            {
                context.Response.StatusCode = StatusCodes.Status304NotModified;
                context.Response.Headers.CacheControl = "public, max-age=60";
                return Task.CompletedTask;
            });
        });
        using var client = host.GetTestClient();

        using var response = await client.GetAsync("/page/");

        Assert.Equal(HttpStatusCode.NotModified, response.StatusCode);
        Assert.Equal("public, max-age=60", response.Headers.NonValidated["Cache-Control"].ToString());
    }

    private static async Task<IHost> StartAsync(Action<IApplicationBuilder> configure, Action<IServiceCollection>? services = null)
    {
        var host = new HostBuilder()
            .ConfigureLogging(static logging => logging.ClearProviders())
            .ConfigureWebHost(web =>
            {
                web.UseTestServer();
                web.ConfigureServices(collection =>
                {
                    collection.AddRouting();
                    services?.Invoke(collection);
                });
                web.Configure(configure);
            })
            .Build();
        await host.StartAsync();
        return host;
    }
}
