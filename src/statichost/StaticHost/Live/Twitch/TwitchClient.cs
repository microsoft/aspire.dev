using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace StaticHost.Live.Twitch;

/// <summary>Default <see cref="ITwitchClient"/> implementation backed by Helix.</summary>
/// <remarks>Creates the client.</remarks>
public sealed class TwitchClient(
    IHttpClientFactory httpFactory,
    TwitchAppTokenProvider tokens,
    IOptionsMonitor<LiveStatusOptions> options,
    ILogger<TwitchClient> logger) : ITwitchClient
{
    /// <summary>Name of the registered <see cref="HttpClient"/>.</summary>
    public const string HttpClientName = "twitch";

    private async Task<HttpClient> CreateHelixClientAsync(CancellationToken ct)
    {
        var client = httpFactory.CreateClient(HttpClientName);
        client.BaseAddress ??= new Uri("https://api.twitch.tv/helix/");

        var token = await tokens.GetAsync(ct).ConfigureAwait(false);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Remove("Client-Id");
        client.DefaultRequestHeaders.Add("Client-Id", options.CurrentValue.Twitch.ClientId);

        return client;
    }

    /// <inheritdoc/>
    public async Task<TwitchUser?> GetUserByLoginAsync(string login, CancellationToken cancellationToken)
    {
        var client = await CreateHelixClientAsync(cancellationToken).ConfigureAwait(false);
        var response = await client.GetAsync($"users?login={Uri.EscapeDataString(login)}", cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var data = doc.RootElement.GetProperty("data");
        if (data.GetArrayLength() == 0) return null;

        var first = data[0];

        return new TwitchUser(
            Id: first.GetProperty("id").GetString() ?? "",
            Login: first.GetProperty("login").GetString() ?? "",
            DisplayName: first.GetProperty("display_name").GetString() ?? "");
    }

    /// <inheritdoc/>
    public async Task<TwitchStreamInfo> GetStreamAsync(string userId, CancellationToken cancellationToken)
    {
        var client = await CreateHelixClientAsync(cancellationToken).ConfigureAwait(false);
        var response = await client.GetAsync($"streams?user_id={Uri.EscapeDataString(userId)}", cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var data = doc.RootElement.GetProperty("data");
        if (data.GetArrayLength() == 0) return new TwitchStreamInfo(false, null);

        var first = data[0];

        return new TwitchStreamInfo(true, first.TryGetProperty("title", out var t) ? t.GetString() : null);
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyList<TwitchEventSubSubscription>> ListEventSubAsync(CancellationToken cancellationToken)
    {
        var client = await CreateHelixClientAsync(cancellationToken).ConfigureAwait(false);
        var response = await client.GetAsync("eventsub/subscriptions", cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var data = doc.RootElement.GetProperty("data");
        var list = new List<TwitchEventSubSubscription>(data.GetArrayLength());

        foreach (var sub in data.EnumerateArray())
        {
            var id = sub.GetProperty("id").GetString() ?? "";
            var type = sub.GetProperty("type").GetString() ?? "";
            var status = sub.GetProperty("status").GetString() ?? "";
            var transport = sub.GetProperty("transport");
            var callback = transport.TryGetProperty("callback", out var cb) ? cb.GetString() ?? "" : "";

            list.Add(new TwitchEventSubSubscription(id, type, status, callback));
        }

        return list;
    }

    /// <inheritdoc/>
    public async Task CreateEventSubAsync(string type, string condition, string callbackUrl, string secret, CancellationToken cancellationToken)
    {
        var client = await CreateHelixClientAsync(cancellationToken).ConfigureAwait(false);
        var conditionDoc = JsonDocument.Parse(condition);
        var payload = new
        {
            type,
            version = "1",
            condition = conditionDoc.RootElement,
            transport = new { method = "webhook", callback = callbackUrl, secret }
        };

        var response = await client.PostAsJsonAsync("eventsub/subscriptions", payload, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            logger.LogWarning("CreateEventSub failed: {Status} {Body}", response.StatusCode, body);
            response.EnsureSuccessStatusCode();
        }
    }

    /// <inheritdoc/>
    public async Task DeleteEventSubAsync(string id, CancellationToken cancellationToken)
    {
        var client = await CreateHelixClientAsync(cancellationToken).ConfigureAwait(false);
        var response = await client.DeleteAsync($"eventsub/subscriptions?id={Uri.EscapeDataString(id)}", cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
    }
}
