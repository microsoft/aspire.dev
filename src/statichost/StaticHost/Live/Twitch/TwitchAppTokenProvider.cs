using System.Text.Json;
using Microsoft.Extensions.Options;

namespace StaticHost.Live.Twitch;

/// <summary>
/// Manages a Twitch Helix app access token (client_credentials grant), refreshing it
/// proactively a few minutes before expiry. Thread-safe.
/// </summary>
/// <remarks>Creates the provider.</remarks>
public sealed class TwitchAppTokenProvider(
    IHttpClientFactory httpFactory,
    IOptionsMonitor<LiveStatusOptions> options,
    ILogger<TwitchAppTokenProvider> logger,
    TimeProvider? timeProvider = null)
{
    /// <summary>Name of the registered <see cref="HttpClient"/> used for token endpoint calls.</summary>
    public const string HttpClientName = "twitch-id";
    private readonly TimeProvider _time = timeProvider ?? TimeProvider.System;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private sealed record CachedToken(string Value, DateTimeOffset ExpiresAt);

    private CachedToken? _cachedToken;

    /// <summary>Gets a current access token, refreshing if needed.</summary>
    public async Task<string> GetAsync(CancellationToken cancellationToken)
    {
        var now = _time.GetUtcNow();
        var cached = Volatile.Read(ref _cachedToken);
        if (cached is not null && cached.ExpiresAt - now > TimeSpan.FromMinutes(5))
        {
            return cached.Value;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            now = _time.GetUtcNow();
            cached = Volatile.Read(ref _cachedToken);
            if (cached is not null && cached.ExpiresAt - now > TimeSpan.FromMinutes(5))
            {
                return cached.Value;
            }

            var twitch = options.CurrentValue.Twitch;
            var client = httpFactory.CreateClient(HttpClientName);
            client.BaseAddress ??= new Uri("https://id.twitch.tv/");
            var form = new FormUrlEncodedContent(
            [
                new KeyValuePair<string, string>("client_id", twitch.ClientId),
                new KeyValuePair<string, string>("client_secret", twitch.ClientSecret),
                new KeyValuePair<string, string>("grant_type", "client_credentials"),
            ]);

            using var response = await client.PostAsync("oauth2/token", form, cancellationToken).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

            var token = doc.RootElement.GetProperty("access_token").GetString()
                ?? throw new InvalidOperationException("Twitch returned a null app access token.");
            var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();

            Volatile.Write(ref _cachedToken, new CachedToken(token, _time.GetUtcNow().AddSeconds(expiresIn)));
            logger.LogInformation("Twitch app token refreshed; expires in {ExpiresIn}s.", expiresIn);

            return token;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>Invalidates a rejected token without discarding a concurrent replacement.</summary>
    public async Task InvalidateAsync(string rejectedToken, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (string.Equals(_cachedToken?.Value, rejectedToken, StringComparison.Ordinal))
            {
                Volatile.Write(ref _cachedToken, null);
                logger.LogDebug("Invalidated a Twitch app token rejected by Helix.");
            }
        }
        finally
        {
            _gate.Release();
        }
    }
}
