using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AstroAdapter.AspNetCore;

/// <summary>
/// Manages the Node.js child process that runs the Astro SSR server.
/// Registered as a hosted service so it starts/stops with the application.
/// </summary>
public sealed class AstroNodeProcess(IOptions<AstroOptions> options, ILogger<AstroNodeProcess> logger) : IHostedService, IAsyncDisposable
{
    private readonly AstroOptions _options = options.Value;
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Process? _process;
    private bool _disposed;

    /// <summary>The port the SSR server is listening on.</summary>
    public int Port => _options.SsrPort;

    /// <summary>Whether the SSR entry point was found and the process was started.</summary>
    public bool IsAvailable => _options.SsrBaseUrl is not null || _process is not null;

    /// <summary>
    /// Returns a task that completes when the SSR server signals readiness.
    /// </summary>
    public Task WaitForReadyAsync(CancellationToken cancellationToken = default) =>
        _ready.Task.WaitAsync(cancellationToken);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        // When an external SSR URL is configured, there is no process to manage.
        if (_options.SsrBaseUrl is not null)
        {
            logger.LogInformation("Using external SSR server at {SsrBaseUrl}", _options.SsrBaseUrl);
            _ready.TrySetResult();
            return Task.CompletedTask;
        }

        var entryPath = Path.GetFullPath(_options.ResolvedServerEntryPath);

        if (!File.Exists(entryPath))
        {
            logger.LogWarning(
                "Astro SSR entry point not found at {EntryPath}. " +
                "Only prerendered content will be served. " +
                "Run 'astro build' with the dotnet adapter to generate SSR output.",
                entryPath);
            _ready.TrySetResult();
            return Task.CompletedTask;
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = _options.NodePath,
            Arguments = entryPath,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        startInfo.Environment["ASTRO_DOTNET_PORT"] = _options.SsrPort.ToString();

        _process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };

        _process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is null) return;

            logger.LogDebug("[Astro SSR] {Output}", e.Data);

            if (e.Data.Contains("SSR server ready"))
            {
                _ready.TrySetResult();
            }
        };

        _process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null)
            {
                logger.LogError("[Astro SSR] {Error}", e.Data);
            }
        };

        _process.Exited += (_, _) =>
        {
            logger.LogWarning("Astro SSR process exited with code {ExitCode}", _process.ExitCode);
            _ready.TrySetResult();
        };

        _process.Start();
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();

        logger.LogInformation(
            "Started Astro SSR process (PID: {ProcessId}) targeting port {Port}",
            _process.Id, _options.SsrPort);

        // Enforce a startup timeout so the app doesn't hang indefinitely.
        _ = EnforceStartupTimeoutAsync(cancellationToken);

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        if (_process is { HasExited: false })
        {
            logger.LogInformation("Stopping Astro SSR process (PID: {ProcessId})...", _process.Id);
            
            try
            {
                _process.Kill(entireProcessTree: true);
                _process.WaitForExit(5000);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Error stopping Astro SSR process");
            }
        }

        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;

        if (_process is { HasExited: false })
        {
            try
            {
                _process.Kill(entireProcessTree: true);
                await _process.WaitForExitAsync();
            }
            catch { /* best effort */ }
        }

        _process?.Dispose();
    }

    private async Task EnforceStartupTimeoutAsync(CancellationToken cancellationToken)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(TimeSpan.FromSeconds(_options.StartupTimeoutSeconds));

        try
        {
            await _ready.Task.WaitAsync(cts.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(
                "Astro SSR process did not signal readiness within {Timeout}s. " +
                "SSR requests may fail until the process is ready.",
                _options.StartupTimeoutSeconds);
            _ready.TrySetResult();
        }
    }
}
