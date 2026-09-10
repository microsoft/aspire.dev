using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Yarp.ReverseProxy.Configuration;

namespace StaticHost.Tests.Live;

public sealed class LiveStatusHostingTests
{
    [Fact]
    public async Task NoBackendUrl_RegistersInProcessCoordinator()
    {
        var builder = WebApplication.CreateBuilder();

        var mode = builder.AddLiveStatusHosting();

        await using var app = builder.Build();
        Assert.Equal(LiveStatusHostingMode.Coordinator, mode);
        Assert.NotNull(app.Services.GetService<LiveStatusBroadcaster>());
        Assert.Null(app.Services.GetService<IProxyConfigProvider>());
    }

    [Fact]
    public async Task BackendUrl_RegistersOnlyLiveStatusProxy()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Configuration["Live:BackendUrl"] = "https://live.example.test";

        var mode = builder.AddLiveStatusHosting();

        await using var app = builder.Build();
        Assert.Equal(LiveStatusHostingMode.Proxy, mode);
        Assert.Null(app.Services.GetService<LiveStatusBroadcaster>());

        var config = app.Services.GetRequiredService<IProxyConfigProvider>().GetConfig();
        var route = Assert.Single(config.Routes);
        Assert.Equal(LiveStatusHostingExtensions.ProxyRouteId, route.RouteId);
        Assert.Equal(LiveStatusHostingExtensions.ProxyClusterId, route.ClusterId);
        Assert.Equal(LiveStatusHostingExtensions.ProxyPath, route.Match.Path);

        var cluster = Assert.Single(config.Clusters);
        Assert.Equal(LiveStatusHostingExtensions.ProxyClusterId, cluster.ClusterId);
        var destination = Assert.Single(cluster.Destinations!);
        Assert.Equal("coordinator", destination.Key);
        Assert.Equal("https://live.example.test/", destination.Value.Address);
    }

    [Theory]
    [InlineData("/api/live")]
    [InlineData("/api/live/stream/")]
    [InlineData("/api/live/youtube/webhook?hub.mode=subscribe")]
    public async Task ProxyRoute_MatchesEveryLiveStatusPath(string path)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration["Live:BackendUrl"] = "https://127.0.0.1:1";
        var mode = builder.AddLiveStatusHosting();

        await using var app = builder.Build();
        app.MapLiveStatusHosting(mode);
        await app.StartAsync();

        using var response = await app.GetTestClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task ProxyRoute_DoesNotCaptureOtherSitePaths()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration["Live:BackendUrl"] = "https://127.0.0.1:1";
        var mode = builder.AddLiveStatusHosting();

        await using var app = builder.Build();
        app.MapLiveStatusHosting(mode);
        await app.StartAsync();

        using var response = await app.GetTestClient().GetAsync("/api/lively");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("http://live.example.test")]
    [InlineData("https://user:password@live.example.test")]
    [InlineData("https://live.example.test/api")]
    [InlineData("https://live.example.test?value=1")]
    [InlineData("not-a-url")]
    public void InvalidBackendUrl_IsRejected(string backendUrl)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Configuration["Live:BackendUrl"] = backendUrl;

        var exception = Assert.Throws<InvalidOperationException>(
            () => builder.AddLiveStatusHosting());

        Assert.Contains("Live:BackendUrl must be an HTTPS origin URL", exception.Message);
    }
}
