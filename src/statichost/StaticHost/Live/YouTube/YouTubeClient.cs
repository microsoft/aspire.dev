using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace StaticHost.Live.YouTube;

/// <summary>Default <see cref="IYouTubeClient"/> implementation.</summary>
/// <remarks>Creates the client.</remarks>
public sealed class YouTubeClient(
    IHttpClientFactory httpFactory,
    IOptionsMonitor<LiveStatusOptions> options,
    ILogger<YouTubeClient> logger) : IYouTubeClient
{
    /// <summary>Name of the registered <see cref="HttpClient"/> for the Data API.</summary>
    public const string HttpClientName = "youtube";

    /// <summary>Name of the registered <see cref="HttpClient"/> for the PubSubHubbub hub.</summary>
    public const string PubSubHttpClientName = "youtube-pubsub";

    private HttpClient ApiClient()
    {
        var c = httpFactory.CreateClient(HttpClientName);
        c.BaseAddress ??= new Uri("https://www.googleapis.com/youtube/v3/");
        return c;
    }

    /// <inheritdoc/>
    public async Task<string?> ResolveChannelIdAsync(string handle, CancellationToken cancellationToken)
    {
        var apiKey = options.CurrentValue.YouTube.ApiKey;
        if (string.IsNullOrEmpty(apiKey)) return null;

        var clean = handle.TrimStart('@');
        var url = $"channels?part=id&forHandle={Uri.EscapeDataString(clean)}&key={Uri.EscapeDataString(apiKey)}";

        using var response = await ApiClient().GetAsync(url, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var items = doc.RootElement.GetProperty("items");
        if (items.GetArrayLength() == 0) return null;

        return items[0].GetProperty("id").GetString();
    }

    /// <inheritdoc/>
    public async Task<YouTubeLiveResult> GetCurrentLiveAsync(string channelId, CancellationToken cancellationToken)
    {
        var apiKey = options.CurrentValue.YouTube.ApiKey;
        if (string.IsNullOrEmpty(apiKey) || string.IsNullOrEmpty(channelId))
        {
            return new YouTubeLiveResult(false, null);
        }

        var url = $"search?part=id&channelId={Uri.EscapeDataString(channelId)}&eventType=live&type=video&key={Uri.EscapeDataString(apiKey)}";
        using var response = await ApiClient().GetAsync(url, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var items = doc.RootElement.GetProperty("items");
        if (items.GetArrayLength() == 0) return new YouTubeLiveResult(false, null);

        var videoId = items[0].GetProperty("id").GetProperty("videoId").GetString();

        return new YouTubeLiveResult(true, videoId);
    }

    /// <inheritdoc/>
    public async Task SubscribeAsync(string channelId, string callbackUrl, string secret, TimeSpan lease, CancellationToken cancellationToken)
    {
        var c = httpFactory.CreateClient(PubSubHttpClientName);
        c.BaseAddress ??= new Uri("https://pubsubhubbub.appspot.com/");

        var topic = $"https://www.youtube.com/xml/feeds/videos.xml?channel_id={channelId}";
        var form = new FormUrlEncodedContent(
        [
            new KeyValuePair<string,string>("hub.callback", callbackUrl),
            new KeyValuePair<string,string>("hub.topic", topic),
            new KeyValuePair<string,string>("hub.verify", "async"),
            new KeyValuePair<string,string>("hub.mode", "subscribe"),
            new KeyValuePair<string,string>("hub.lease_seconds", ((int)lease.TotalSeconds).ToString(CultureInfo.InvariantCulture)),
            new KeyValuePair<string,string>("hub.secret", secret),
        ]);

        using var response = await c.PostAsync("subscribe", form, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            logger.LogWarning("YouTube WebSub subscribe failed: {Status} {Body}", response.StatusCode, body);
            response.EnsureSuccessStatusCode();
        }
    }
}
