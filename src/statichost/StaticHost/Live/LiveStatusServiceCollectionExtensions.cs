using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Http.Resilience;
using StaticHost.Live.Twitch;
using StaticHost.Live.YouTube;

namespace StaticHost.Live;

/// <summary>
/// Registers everything required for the aspire.dev live-status feature.
/// </summary>
public static class LiveStatusServiceCollectionExtensions
{
    /// <summary>
    /// Registers the in-memory <see cref="LiveStatusBroadcaster"/>, named
    /// <see cref="HttpClient"/> instances (<c>"twitch"</c>, <c>"twitch-id"</c>,
    /// <c>"youtube"</c>, <c>"youtube-pubsub"</c>) with standard resilience, the
    /// Twitch token provider + Helix client, the YouTube Data + WebSub client,
    /// and the two <see cref="BackgroundService"/> workers
    /// (<see cref="TwitchEventSubService"/> and <see cref="YouTubeWebSubService"/>).
    /// Options are bound from the <c>"Live"</c> configuration section.
    /// </summary>
    /// <remarks>
    /// Missing secrets are <b>non-fatal</b>: the corresponding worker logs a
    /// warning at startup and stays idle. The SSE endpoint still works and
    /// reports <c>{ isLive: false }</c>. This means the site ships fine before
    /// any keys have been provisioned.
    /// </remarks>
    public static TBuilder AddLiveStatus<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services
            .AddOptions<LiveStatusOptions>()
            .Bind(builder.Configuration.GetSection(LiveStatusOptions.SectionName))
            .ValidateDataAnnotations();

        builder.Services.AddSingleton<LiveStatusBroadcaster>();
        builder.Services.AddSingleton(TimeProvider.System);

        builder.Services.AddHttpClient(TwitchClient.HttpClientName)
            .AddStandardResilienceHandler();
        builder.Services.AddHttpClient(TwitchAppTokenProvider.HttpClientName)
            .AddStandardResilienceHandler();
        builder.Services.AddHttpClient(YouTubeClient.HttpClientName)
            .AddStandardResilienceHandler();
        builder.Services.AddHttpClient(YouTubeClient.PubSubHttpClientName)
            .AddStandardResilienceHandler();

        builder.Services.AddSingleton<TwitchAppTokenProvider>();
        builder.Services.AddSingleton<ITwitchClient, TwitchClient>();
        builder.Services.AddSingleton<IYouTubeClient, YouTubeClient>();

        builder.Services.AddHostedService<TwitchEventSubService>();
        builder.Services.AddHostedService<YouTubeWebSubService>();

        return builder;
    }
}
