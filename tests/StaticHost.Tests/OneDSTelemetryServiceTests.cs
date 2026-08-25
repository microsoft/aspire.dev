using System.Diagnostics;
using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using StaticHost.Telemetry;

namespace StaticHost.Tests;

public sealed class OneDSTelemetryServiceTests
{
    [Theory]
    [InlineData("install.ps1", "windows")]
    [InlineData("install.sh", "unix")]
    public void TrackDownload_emits_aggregate_install_funnel_tags(string scriptName, string platform)
    {
        Activity? stoppedActivity = null;
        using var listener = CreateListener(activity => stoppedActivity = activity);
        var service = CreateService(Environments.Production);
        var context = CreateContext();

        service.TrackDownload(context, scriptName);

        var activity = Assert.IsType<Activity>(stoppedActivity);
        var tags = activity.TagObjects.ToDictionary(tag => tag.Key, tag => tag.Value);

        Assert.Equal(TelemetryConstants.Activities.InstallScriptDownload, activity.OperationName);
        Assert.Equal(1, tags[TelemetryConstants.Tags.SchemaVersion]);
        Assert.Equal("cli_install", tags[TelemetryConstants.Tags.Funnel]);
        Assert.Equal("script_requested", tags[TelemetryConstants.Tags.FunnelStep]);
        Assert.Equal(4, tags[TelemetryConstants.Tags.FunnelStepIndex]);
        Assert.Equal("aggregate", tags[TelemetryConstants.Tags.Correlation]);
        Assert.Equal("script", tags[TelemetryConstants.Tags.Method]);
        Assert.Equal(platform, tags[TelemetryConstants.Tags.Platform]);
        Assert.Equal(scriptName, tags[TelemetryConstants.Tags.ScriptName]);
        Assert.DoesNotContain("request_referer", tags.Keys);
    }

    [Fact]
    public void TrackDownload_skips_nonproduction_environments()
    {
        var stoppedActivities = 0;
        using var listener = CreateListener(_ => stoppedActivities++);
        var service = CreateService(Environments.Development);

        service.TrackDownload(CreateContext(), "install.sh");

        Assert.Equal(0, stoppedActivities);
    }

    private static ActivityListener CreateListener(Action<Activity> onStopped)
    {
        var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == TelemetryConstants.AspireDotDevSource,
            Sample = static (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = onStopped,
        };
        ActivitySource.AddActivityListener(listener);
        return listener;
    }

    private static OneDSTelemetryService CreateService(string environmentName) =>
        new(
            NullLogger<OneDSTelemetryService>.Instance,
            new TestWebHostEnvironment { EnvironmentName = environmentName });

    private static DefaultHttpContext CreateContext()
    {
        var context = new DefaultHttpContext();
        context.Request.Scheme = "https";
        context.Request.Host = new HostString("aspire.dev");
        context.Request.Headers.Referer = "https://aspire.dev/get-started/install-cli/?q=private";
        context.Request.Headers.UserAgent = "test-agent";
        context.Connection.RemoteIpAddress = IPAddress.Loopback;
        return context;
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "StaticHost.Tests";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = string.Empty;
        public string EnvironmentName { get; set; } = Environments.Development;
        public string WebRootPath { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    }
}
