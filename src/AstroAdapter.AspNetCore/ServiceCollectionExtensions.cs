using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace AstroAdapter.AspNetCore;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Adds Astro adapter services including the Node.js SSR process manager
    /// and the HTTP client used for SSR proxying.
    /// </summary>
    public static IServiceCollection AddAstro(
        this IServiceCollection services,
        Action<AstroOptions>? configure = null)
    {
        if (configure is not null)
        {
            services.Configure(configure);
        }

        services.AddHttpClient("AstroSsr", (sp, client) =>
        {
            var options = sp.GetRequiredService<IOptions<AstroOptions>>().Value;
            client.Timeout = options.RequestTimeout;
        });

        services.AddSingleton<AstroNodeProcess>();
        services.AddHostedService(sp => sp.GetRequiredService<AstroNodeProcess>());

        return services;
    }
}
