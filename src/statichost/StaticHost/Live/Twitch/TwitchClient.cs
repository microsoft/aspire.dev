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

    private async Task<HttpResponseMessage> SendHelixAsync(
        Func<HttpRequestMessage> createRequest,
        CancellationToken cancellationToken)
    {
        var client = httpFactory.CreateClient(HttpClientName);
        client.BaseAddress ??= new Uri("https://api.twitch.tv/helix/");

        for (var attempt = 0; ; attempt++)
        {
            var token = await tokens.GetAsync(cancellationToken).ConfigureAwait(false);
            using var request = createRequest();
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Headers.Add("Client-Id", options.CurrentValue.Twitch.ClientId);

            var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (response.StatusCode != System.Net.HttpStatusCode.Unauthorized)
            {
                return response;
            }

            using (response)
            {
                await tokens.InvalidateAsync(token, cancellationToken).ConfigureAwait(false);
                if (attempt > 0)
                {
                    response.EnsureSuccessStatusCode();
                }
            }

            logger.LogWarning("Twitch Helix rejected an app token; retrying the request once with a refreshed token.");
        }
    }

    /// <inheritdoc/>
    public async Task<TwitchUser?> GetUserByLoginAsync(string login, CancellationToken cancellationToken)
    {
        using var response = await SendHelixAsync(
            () => new HttpRequestMessage(HttpMethod.Get, $"users?login={Uri.EscapeDataString(login)}"),
            cancellationToken).ConfigureAwait(false);
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
        using var response = await SendHelixAsync(
            () => new HttpRequestMessage(HttpMethod.Get, $"streams?user_id={Uri.EscapeDataString(userId)}"),
            cancellationToken).ConfigureAwait(false);
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
        using var response = await SendHelixAsync(
            () => new HttpRequestMessage(HttpMethod.Get, "eventsub/subscriptions"),
            cancellationToken).ConfigureAwait(false);
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
            var condition = sub.TryGetProperty("condition", out var conditionEl) ? conditionEl : default;
            var broadcasterUserId = condition.ValueKind == JsonValueKind.Object &&
                condition.TryGetProperty("broadcaster_user_id", out var broadcasterUserIdEl)
                    ? broadcasterUserIdEl.GetString()
                    : null;

            list.Add(new TwitchEventSubSubscription(id, type, status, callback, broadcasterUserId));
        }

        return list;
    }

    /// <inheritdoc/>
    public async Task CreateEventSubAsync(string type, string condition, string callbackUrl, string secret, CancellationToken cancellationToken)
    {
        using var conditionDoc = JsonDocument.Parse(condition);
        var payload = new
        {
            type,
            version = "1",
            condition = conditionDoc.RootElement,
            transport = new { method = "webhook", callback = callbackUrl, secret }
        };

        using var response = await SendHelixAsync(
            () => new HttpRequestMessage(HttpMethod.Post, "eventsub/subscriptions")
            {
                Content = JsonContent.Create(payload),
            },
            cancellationToken).ConfigureAwait(false);
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
        using var response = await SendHelixAsync(
            () => new HttpRequestMessage(HttpMethod.Delete, $"eventsub/subscriptions?id={Uri.EscapeDataString(id)}"),
            cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
    }
}
