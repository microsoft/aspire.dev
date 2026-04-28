using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace StaticHost.Live.Twitch;

/// <summary>
/// Manages a Twitch Helix app access token (client_credentials grant), refreshing it
/// proactively a few minutes before expiry. Thread-safe.
/// </summary>
public sealed class TwitchAppTokenProvider
{
    /// <summary>Name of the registered <see cref="HttpClient"/> used for token endpoint calls.</summary>
    public const string HttpClientName = "twitch-id";

    private readonly IHttpClientFactory _httpFactory;
    private readonly IOptionsMonitor<LiveStatusOptions> _options;
    private readonly TimeProvider _time;
    private readonly ILogger<TwitchAppTokenProvider> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private string? _token;
    private DateTimeOffset _expiresAt;

    /// <summary>Creates the provider.</summary>
    public TwitchAppTokenProvider(
        IHttpClientFactory httpFactory,
        IOptionsMonitor<LiveStatusOptions> options,
        ILogger<TwitchAppTokenProvider> logger,
        TimeProvider? timeProvider = null)
    {
        _httpFactory = httpFactory;
        _options = options;
        _time = timeProvider ?? TimeProvider.System;
        _logger = logger;
    }

    /// <summary>Gets a current access token, refreshing if needed.</summary>
    public async Task<string> GetAsync(CancellationToken cancellationToken)
    {
        var now = _time.GetUtcNow();
        if (_token is { Length: > 0 } && _expiresAt - now > TimeSpan.FromMinutes(5))
        {
            return _token;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            now = _time.GetUtcNow();
            if (_token is { Length: > 0 } && _expiresAt - now > TimeSpan.FromMinutes(5))
            {
                return _token;
            }

            var twitch = _options.CurrentValue.Twitch;
            var client = _httpFactory.CreateClient(HttpClientName);
            client.BaseAddress ??= new Uri("https://id.twitch.tv/");
            var form = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("client_id", twitch.ClientId),
                new KeyValuePair<string, string>("client_secret", twitch.ClientSecret),
                new KeyValuePair<string, string>("grant_type", "client_credentials"),
            });
            using var response = await client.PostAsync("oauth2/token", form, cancellationToken).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
            _token = doc.RootElement.GetProperty("access_token").GetString();
            var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
            _expiresAt = _time.GetUtcNow().AddSeconds(expiresIn);
            _logger.LogInformation("Twitch app token refreshed; expires in {ExpiresIn}s.", expiresIn);
            return _token!;
        }
        finally
        {
            _gate.Release();
        }
    }
}
