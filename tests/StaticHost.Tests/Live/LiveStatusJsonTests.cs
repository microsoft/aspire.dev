namespace StaticHost.Tests.Live;

public sealed class LiveStatusJsonTests
{
    [Fact]
    public void Serialize_UsesLowercaseYouTubePropertyName()
    {
        var json = JsonSerializer.Serialize(
            LiveStatus.Idle,
            LiveStatusJsonContext.Default.LiveStatus);

        Assert.Contains("\"youtube\":", json, StringComparison.Ordinal);
        Assert.Contains("\"liveSessionId\":", json, StringComparison.Ordinal);
        Assert.DoesNotContain("\"youTube\":", json, StringComparison.Ordinal);
    }
}
