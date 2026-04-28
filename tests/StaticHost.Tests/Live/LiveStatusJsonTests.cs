using System.Text.Json;
using StaticHost.Live;
using Xunit;

namespace StaticHost.Tests.Live;

public class LiveStatusJsonTests
{
    [Fact]
    public void Snapshot_uses_lowercase_youtube_property_name()
    {
        var json = JsonSerializer.Serialize(
            LiveStatus.Idle,
            LiveStatusJsonContext.Default.LiveStatus);

        Assert.Contains("\"youtube\":", json, StringComparison.Ordinal);
        Assert.DoesNotContain("\"youTube\":", json, StringComparison.Ordinal);
    }
}
