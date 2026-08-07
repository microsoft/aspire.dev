namespace StaticHost.AgentReadiness;

/// <summary>
/// Composition-root extension methods for the agent-readiness middlewares.
/// </summary>
public static class AgentReadinessExtensions
{
    /// <summary>
    /// Registers the markdown content-negotiation middleware and the Link
    /// header middleware. Call <strong>before</strong> <c>UseDefaultFiles</c>
    /// and <c>UseRouting</c> so the middlewares operate on the original
    /// request path; otherwise <c>UseDefaultFiles</c> rewrites <c>/foo/</c>
    /// to <c>/foo/index.html</c> and routing pre-selects the HTML endpoint.
    /// </summary>
    public static IApplicationBuilder UseAgentReadiness(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // Order matters: markdown negotiation MUST run first so it can
        // short-circuit the pipeline and serve the .md body directly without
        // the Link header middleware ever seeing the request.
        app.UseMiddleware<MarkdownNegotiationMiddleware>();
        app.UseMiddleware<LinkHeaderMiddleware>();
        return app;
    }
}
