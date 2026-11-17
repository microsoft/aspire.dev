namespace StaticHost.Tests;

public sealed class ForwardedHostTests
{
    private const string OriginHost = "aspiredev-abc123.azurewebsites.net";

    [Fact]
    public async Task Forwarded_host_applies_without_a_client_ip()
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync();

        using var response = await server.GetAsync(
            $"https://{OriginHost}/echo",
            forwardedHost: "aspire.dev",
            clientIp: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.StartsWith("https://aspire.dev|", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("aspire.dev", false)]
    [InlineData("aspire.dev", true)]
    [InlineData("www.aspire.dev", false)]
    [InlineData("www.aspire.dev", true)]
    [InlineData("dev.aspire.dev", false)]
    [InlineData("dev.aspire.dev", true)]
    [InlineData("www.dev.aspire.dev", false)]
    [InlineData("www.dev.aspire.dev", true)]
    public async Task Directory_redirect_uses_the_host_forwarded_by_front_door(
        string forwardedHost,
        bool frameworkForwardedHeaders)
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync(frameworkForwardedHeaders);

        using var response = await server.GetAsync(
            $"https://{OriginHost}/docs?tab=cli",
            forwardedHost);

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal(
            $"https://{forwardedHost}/docs/?tab=cli",
            response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Forwarded_scheme_and_host_apply_together_when_framework_forwarding_is_enabled()
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync(frameworkForwardedHeaders: true);

        using var response = await server.GetAsync(
            $"http://{OriginHost}/docs",
            forwardedHost: "aspire.dev",
            forwardedProto: "https");

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal("https://aspire.dev/docs/", response.Headers.Location?.OriginalString);
    }

    [Theory]
    [InlineData("evil.example")]
    [InlineData("aspire.dev.evil.example")]
    [InlineData("notaspire.dev")]
    [InlineData("203.0.113.7")]
    public async Task Directory_redirect_ignores_a_forwarded_host_this_site_does_not_serve(string forwardedHost)
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync();

        using var response = await server.GetAsync(
            $"https://{OriginHost}/docs",
            forwardedHost);

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal($"https://{OriginHost}/docs/", response.Headers.Location?.OriginalString);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData(null, true)]
    [InlineData("", false)]
    [InlineData(" ; , ", true)]
    public async Task Forwarded_host_is_ignored_when_no_hosts_are_configured(
        string? configuredHosts,
        bool frameworkForwardedHeaders)
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync(frameworkForwardedHeaders, configuredHosts);

        using var response = await server.GetAsync(
            $"https://{OriginHost}/docs",
            forwardedHost: "aspire.dev");

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal($"https://{OriginHost}/docs/", response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Client_ip_applies_when_no_hosts_are_configured()
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync(forwardedHosts: null);

        using var response = await server.GetAsync(
            $"https://{OriginHost}/echo",
            forwardedHost: "aspire.dev",
            clientIp: "203.0.113.7");

        Assert.Equal($"https://{OriginHost}|203.0.113.7", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("example.org", "example.org")]
    [InlineData("example.org;www.example.org", "www.example.org")]
    [InlineData("example.org, www.example.org", "www.example.org")]
    [InlineData(" ;example.org; ", "example.org")]
    [InlineData("*.example.org", "www.dev.example.org")]
    public async Task Directory_redirect_honors_the_configured_hosts(string configuredHosts, string forwardedHost)
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync(forwardedHosts: configuredHosts);

        using var response = await server.GetAsync(
            $"https://{OriginHost}/docs",
            forwardedHost);

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal($"https://{forwardedHost}/docs/", response.Headers.Location?.OriginalString);
    }

    [Theory]
    [InlineData("example.org", "aspire.dev")]
    [InlineData("*.example.org", "example.org")]
    public async Task Directory_redirect_ignores_hosts_outside_the_configured_list(
        string configuredHosts,
        string forwardedHost)
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync(forwardedHosts: configuredHosts);

        using var response = await server.GetAsync(
            $"https://{OriginHost}/docs",
            forwardedHost);

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal($"https://{OriginHost}/docs/", response.Headers.Location?.OriginalString);
    }

    [Theory]
    [InlineData("aspire.dev")]
    [InlineData("example.org")]
    public async Task Hosts_added_by_other_startup_code_are_kept_alongside_the_configured_hosts(string forwardedHost)
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync(
            configureForwardedHeaders: static options => options.AllowedHosts.Add("example.org"));

        using var response = await server.GetAsync(
            $"https://{OriginHost}/docs",
            forwardedHost);

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal($"https://{forwardedHost}/docs/", response.Headers.Location?.OriginalString);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData(null, "localhost:8080")]
    [InlineData(ForwardedHeadersTestServer.DeployedForwardedHosts, null)]
    [InlineData(ForwardedHeadersTestServer.DeployedForwardedHosts, "localhost:8080")]
    public async Task Localhost_requests_keep_the_request_host(string? configuredHosts, string? forwardedHost)
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync(forwardedHosts: configuredHosts);

        using var response = await server.GetAsync(
            "http://localhost:5000/docs",
            forwardedHost,
            clientIp: null);

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal("http://localhost:5000/docs/", response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Forwarded_host_and_client_ip_apply_together()
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync();

        using var response = await server.GetAsync(
            $"https://{OriginHost}/echo",
            forwardedHost: "aspire.dev",
            clientIp: "203.0.113.7");

        Assert.Equal("https://aspire.dev|203.0.113.7", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Client_ip_alone_keeps_the_origin_host()
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync();

        using var response = await server.GetAsync(
            $"https://{OriginHost}/echo",
            clientIp: "203.0.113.7");

        Assert.Equal($"https://{OriginHost}|203.0.113.7", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Request_on_the_public_host_without_forwarded_headers_is_unchanged()
    {
        await using var server = await ForwardedHeadersTestServer.StartAsync();

        using var response = await server.GetAsync("https://aspire.dev/docs", clientIp: null);

        Assert.Equal(HttpStatusCode.MovedPermanently, response.StatusCode);
        Assert.Equal("https://aspire.dev/docs/", response.Headers.Location?.OriginalString);
    }
}
