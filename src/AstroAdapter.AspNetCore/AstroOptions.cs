namespace AstroAdapter.AspNetCore;

/// <summary>
/// Configuration for the Astro adapter middleware.
/// </summary>
public sealed class AstroOptions
{
    /// <summary>
    /// Path to the Astro build output directory (the <c>dist</c> folder).
    /// When set, <see cref="ClientPath"/> defaults to <c>{DistPath}/client</c>
    /// and <see cref="ServerEntryPath"/> defaults to <c>{DistPath}/server/entry.mjs</c>.
    /// </summary>
    public string? DistPath { get; set; }

    /// <summary>
    /// Override: absolute or relative path to the directory containing
    /// prerendered pages and static assets (normally <c>dist/client</c>).
    /// </summary>
    public string? ClientPath { get; set; }

    /// <summary>
    /// Override: absolute or relative path to the SSR server entry point
    /// (normally <c>dist/server/entry.mjs</c>).
    /// </summary>
    public string? ServerEntryPath { get; set; }

    /// <summary>
    /// The localhost port the Node.js SSR process listens on.
    /// </summary>
    public int SsrPort { get; set; } = 5099;

    /// <summary>
    /// Path to the Node.js executable.
    /// </summary>
    public string NodePath { get; set; } = "node";

    /// <summary>
    /// Maximum time to wait for the Node.js SSR server to become ready.
    /// </summary>
    public int StartupTimeoutSeconds { get; set; } = 30;

    /// <summary>
    /// HTTP request timeout for individual SSR proxy requests.
    /// </summary>
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Base URL of an external SSR server. When set, the adapter proxies to
    /// this URL directly instead of managing a local Node.js child process.
    /// Useful in Aspire deployments where the SSR server runs as a separate
    /// resource with service discovery (e.g. <c>"http://astro-ssr"</c>).
    /// </summary>
    public string? SsrBaseUrl { get; set; }

    internal string ResolvedClientPath =>
        ClientPath ?? Path.Combine(DistPath ?? "dist", "client");

    internal string ResolvedServerEntryPath =>
        ServerEntryPath ?? Path.Combine(DistPath ?? "dist", "server", "entry.mjs");
}
