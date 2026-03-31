using System.Net;
using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace PreviewHost.Previews;

internal sealed class PreviewRequestDispatcher(
    PreviewStateStore stateStore,
    IWebHostEnvironment environment,
    IOptions<PreviewHostOptions> options)
{
    private static readonly JsonSerializerOptions WebJsonOptions = CreateJsonOptions();
    private static readonly string AspireFaviconDataUri = $"data:image/svg+xml,{Uri.EscapeDataString(AspireLogoSvg)}";
    private readonly PreviewHostOptions _options = options.Value;
    private readonly string _previewShellRoot = Path.Combine(
            string.IsNullOrWhiteSpace(environment.WebRootPath)
                ? Path.Combine(AppContext.BaseDirectory, "wwwroot")
                : environment.WebRootPath,
            "_preview");

    public async Task DispatchIndexAsync(HttpContext context, CancellationToken cancellationToken)
    {
        await WritePreviewShellAsync(context, "index.html", cancellationToken);
    }

    public async Task DispatchAsync(HttpContext context, int pullRequestNumber, string relativePath, CancellationToken cancellationToken)
    {
        var snapshot = await stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);

        if (snapshot is null || !snapshot.IsReady || string.IsNullOrWhiteSpace(snapshot.ActiveDirectoryPath))
        {
            if (!string.IsNullOrEmpty(relativePath))
            {
                context.Response.Redirect(PreviewRoute.BuildPath(pullRequestNumber));
                return;
            }

            await WritePreviewShellAsync(context, "status.html", cancellationToken);
            return;
        }

        await stateStore.TouchAsync(pullRequestNumber, cancellationToken);

        var resolvedFile = ResolvePreviewFile(snapshot.ActiveDirectoryPath, relativePath);
        if (resolvedFile is null)
        {
            var fallback404Path = Path.Combine(snapshot.ActiveDirectoryPath, "404.html");
            if (File.Exists(fallback404Path))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                await ServeFileAsync(context, fallback404Path, "text/html; charset=utf-8", "no-cache, no-store, must-revalidate", cancellationToken);
                return;
            }

            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await WriteHtmlAsync(context, BuildInfoPage(
                title: $"PR #{pullRequestNumber} file not found",
                body: "The requested page was not found in the prepared preview artifact."), cancellationToken);
            return;
        }

        await ServeResolvedFileAsync(context, snapshot, resolvedFile, cancellationToken);
    }

    private static async Task ServeFileAsync(
        HttpContext context,
        string filePath,
        string contentType,
        string cacheControl,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = cacheControl;
        context.Response.ContentType = contentType;
        await context.Response.SendFileAsync(filePath, cancellationToken);
    }

    private async Task ServeResolvedFileAsync(
        HttpContext context,
        PreviewStatusSnapshot snapshot,
        ResolvedPreviewFile resolvedFile,
        CancellationToken cancellationToken)
    {
        if (!ShouldRewritePreviewContent(resolvedFile.ContentType, snapshot.PreviewPath))
        {
            await ServeFileAsync(context, resolvedFile.FilePath, resolvedFile.ContentType, resolvedFile.CacheControl, cancellationToken);
            return;
        }

        var originalContent = await File.ReadAllTextAsync(resolvedFile.FilePath, cancellationToken);
        var rewrittenContent = RewritePreviewContent(originalContent, resolvedFile.ContentType, snapshot.PreviewPath);

        context.Response.Headers.CacheControl = resolvedFile.CacheControl;
        context.Response.ContentType = resolvedFile.ContentType;
        await context.Response.WriteAsync(rewrittenContent, cancellationToken);
    }

    private static ResolvedPreviewFile? ResolvePreviewFile(string previewRoot, string relativePath)
    {
        var normalizedPath = string.IsNullOrWhiteSpace(relativePath)
            ? "index.html"
            : relativePath.Replace('\\', '/').TrimStart('/');

        if (string.IsNullOrWhiteSpace(normalizedPath))
        {
            normalizedPath = "index.html";
        }

        if (normalizedPath.EndsWith("/", StringComparison.Ordinal))
        {
            normalizedPath = $"{normalizedPath}index.html";
        }

        if (normalizedPath.Contains("..", StringComparison.Ordinal))
        {
            return null;
        }

        var candidatePath = Path.GetFullPath(Path.Combine(previewRoot, normalizedPath.Replace('/', Path.DirectorySeparatorChar)));
        var fullPreviewRoot = Path.GetFullPath(previewRoot + Path.DirectorySeparatorChar);

        if (!candidatePath.StartsWith(fullPreviewRoot, StringComparison.Ordinal))
        {
            return null;
        }

        if (!File.Exists(candidatePath) && !Path.HasExtension(candidatePath))
        {
            var directoryIndexPath = Path.Combine(candidatePath, "index.html");
            if (File.Exists(directoryIndexPath))
            {
                candidatePath = directoryIndexPath;
            }
        }

        if (!File.Exists(candidatePath))
        {
            return null;
        }

        var contentTypeProvider = new FileExtensionContentTypeProvider();
        if (!contentTypeProvider.TryGetContentType(candidatePath, out var contentType))
        {
            contentType = "application/octet-stream";
        }

        var relativeFilePath = Path.GetRelativePath(previewRoot, candidatePath).Replace('\\', '/');
        var cacheControl = candidatePath.EndsWith(".html", StringComparison.OrdinalIgnoreCase)
            ? "no-cache, no-store, must-revalidate"
            : relativeFilePath.StartsWith("_astro/", StringComparison.Ordinal)
                ? "max-age=31536000, public, immutable"
                : "public, max-age=300";

        return new ResolvedPreviewFile(candidatePath, contentType, cacheControl);
    }

    private static async Task WriteHtmlAsync(HttpContext context, string html, CancellationToken cancellationToken)
    {
        context.Response.ContentType = "text/html; charset=utf-8";
        context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        await context.Response.WriteAsync(html, cancellationToken);
    }

    private async Task WritePreviewShellAsync(HttpContext context, string fileName, CancellationToken cancellationToken)
    {
        var filePath = Path.Combine(_previewShellRoot, fileName);
        if (!File.Exists(filePath))
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await WriteHtmlAsync(
                context,
                BuildInfoPage(
                    title: "Preview shell is unavailable",
                    body: $"The preview host could not find the '{fileName}' shell asset under '/_preview/'."),
                cancellationToken);
            return;
        }

        await ServeFileAsync(
            context,
            filePath,
            contentType: "text/html; charset=utf-8",
            cacheControl: "no-cache, no-store, must-revalidate",
            cancellationToken);
    }

    private static string BuildLoaderPage(PreviewStatusSnapshot snapshot)
    {
        var serializedSnapshot = JsonSerializer.Serialize(snapshot, WebJsonOptions);
        var escapedMessage = HtmlEncoder.Default.Encode(snapshot.Message);
        var escapedStage = HtmlEncoder.Default.Encode(snapshot.Stage);
        var escapedPreviewPath = HtmlEncoder.Default.Encode(snapshot.PreviewPath);
        var escapedHint = HtmlEncoder.Default.Encode(BuildHintText(snapshot));
        var escapedPullRequestUrl = HtmlEncoder.Default.Encode(BuildPullRequestUrl(snapshot));
        var cancelButtonHidden = snapshot.State is PreviewLoadState.Ready or PreviewLoadState.Failed or PreviewLoadState.Cancelled ? "hidden" : string.Empty;

        return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="icon" href="{{AspireFaviconDataUri}}">
          <title>Aspire PR #{{snapshot.PullRequestNumber}} preview</title>
          <style>
            :root {
              color-scheme: dark;
              --bg: #0b1020;
              --panel: rgba(13, 24, 45, 0.85);
              --border: rgba(131, 146, 190, 0.35);
              --accent: #a78bfa;
              --accent-2: #4fd1c5;
              --text: #eef2ff;
              --muted: #bac6f5;
              --error: #fb7185;
            }

            * { box-sizing: border-box; }

            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 2rem;
              background:
                radial-gradient(circle at top, rgba(167, 139, 250, 0.3), transparent 35%),
                radial-gradient(circle at bottom right, rgba(79, 209, 197, 0.2), transparent 35%),
                var(--bg);
              color: var(--text);
              font-family: Inter, Segoe UI, system-ui, sans-serif;
            }

            .shell {
              width: min(48rem, 100%);
              border: 1px solid var(--border);
              background: var(--panel);
              border-radius: 1.5rem;
              padding: 2rem;
              box-shadow: 0 2rem 4rem rgba(0, 0, 0, 0.35);
              backdrop-filter: blur(12px);
            }

            .topline {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 1.25rem;
            }

            .brand {
              display: flex;
              align-items: center;
              gap: 1rem;
              min-width: 0;
            }

            .logo {
              flex: none;
              display: grid;
              place-items: center;
              width: 4rem;
              height: 4rem;
              border-radius: 1rem;
              background: linear-gradient(180deg, rgba(116, 85, 221, 0.28), rgba(81, 43, 212, 0.18));
              border: 1px solid rgba(151, 128, 229, 0.35);
              box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
            }

            .logo svg {
              width: 2.4rem;
              height: 2.4rem;
            }

            .eyebrow {
              text-transform: uppercase;
              letter-spacing: 0.18em;
              font-size: 0.75rem;
              color: var(--accent-2);
              margin-bottom: 0.75rem;
            }

            h1 {
              margin: 0;
              font-size: clamp(2rem, 3vw, 2.6rem);
              line-height: 1.1;
            }

            p {
              color: var(--muted);
              line-height: 1.6;
            }

            .actions {
              display: flex;
              flex-wrap: wrap;
              justify-content: flex-end;
              gap: 0.75rem;
            }

            .action-link,
            .action-button {
              display: inline-flex;
              align-items: center;
              gap: 0.55rem;
              border-radius: 999px;
              padding: 0.8rem 1rem;
              font: inherit;
              text-decoration: none;
              transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
            }

            .action-link {
              color: var(--text);
              border: 1px solid rgba(255, 255, 255, 0.12);
              background: rgba(255, 255, 255, 0.04);
            }

            .action-button {
              color: var(--text);
              border: 1px solid rgba(251, 113, 133, 0.3);
              background: rgba(251, 113, 133, 0.08);
              cursor: pointer;
            }

            .action-button:hover:not(:disabled),
            .action-link:hover {
              transform: translateY(-1px);
              border-color: rgba(167, 139, 250, 0.55);
            }

            .action-button:disabled {
              cursor: wait;
              opacity: 0.72;
            }

            .action-icon {
              width: 1rem;
              height: 1rem;
              fill: currentColor;
              flex: none;
            }

            .progress-stack {
              display: grid;
              gap: 0.95rem;
              margin-top: 1.5rem;
            }

            .progress-card {
              padding: 0.9rem 1rem 1rem;
              border-radius: 1rem;
              background: rgba(255, 255, 255, 0.03);
              border: 1px solid rgba(255, 255, 255, 0.06);
            }

            .progress-header {
              display: flex;
              justify-content: space-between;
              gap: 1rem;
              align-items: baseline;
              margin-bottom: 0.6rem;
            }

            .progress-label {
              font-size: 0.9rem;
              color: var(--text);
            }

            .progress-value {
              color: var(--muted);
              font-size: 0.9rem;
            }

            .progress {
              padding: 0.35rem;
              background: rgba(255, 255, 255, 0.08);
              border-radius: 999px;
              overflow: hidden;
            }

            .progress > div {
              height: 0.85rem;
              width: 0%;
              border-radius: 999px;
              background: linear-gradient(90deg, var(--accent), var(--accent-2));
              transition: width 0.35s ease;
            }

            .progress.stage > div {
              background: linear-gradient(90deg, rgba(79, 209, 197, 0.85), rgba(185, 170, 238, 0.95));
            }

            dl {
              margin: 1.25rem 0 0;
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 0.75rem 1rem;
            }

            dt {
              font-size: 0.75rem;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: var(--muted);
            }

            dd {
              margin: 0.35rem 0 0;
              font-size: 1rem;
            }

            .hint {
              margin-top: 1rem;
              font-size: 0.95rem;
            }

            .error {
              color: var(--error);
            }
          </style>
        </head>
        <body>
          <main class="shell">
            <div class="topline">
              <div class="brand">
                <div class="logo" aria-hidden="true">{{AspireLogoSvg}}</div>
                <div>
                  <div class="eyebrow">Aspire PR Preview</div>
                  <h1>Preparing PR #{{snapshot.PullRequestNumber}}</h1>
                </div>
              </div>
              <div class="actions">
                <a class="action-link" href="{{PreviewRoute.CollectionPath}}">
                  <svg class="action-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.78 12.53a.75.75 0 0 0 0-1.06L4.81 8.5H14.5a.75.75 0 0 0 0-1.5H4.81l2.97-2.97a.75.75 0 1 0-1.06-1.06l-4.25 4.25a.75.75 0 0 0 0 1.06l4.25 4.25a.75.75 0 0 0 1.06 0Z"/></svg>
                  <span>Back to previews</span>
                </a>
                <a class="action-link" href="{{escapedPullRequestUrl}}" target="_blank" rel="noreferrer noopener">
                  <svg class="action-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.63 2.29 6.71 5.47 7.8.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.97-.81-1.16-.27-.15-.66-.52-.01-.53.61-.01 1.04.57 1.18.81.69 1.2 1.79.86 2.23.66.07-.51.27-.86.49-1.06-1.78-.21-3.64-.92-3.64-4.07 0-.9.31-1.64.82-2.22-.08-.21-.36-1.05.08-2.18 0 0 .67-.22 2.2.85a7.43 7.43 0 0 1 4 0c1.53-1.07 2.2-.85 2.2-.85.44 1.13.16 1.97.08 2.18.51.58.82 1.31.82 2.22 0 3.16-1.87 3.86-3.65 4.07.29.26.54.76.54 1.54 0 1.11-.01 2-.01 2.27 0 .22.15.49.55.4A8.23 8.23 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z"/></svg>
                  <span>Open PR #{{snapshot.PullRequestNumber}}</span>
                </a>
                <button class="action-button" id="cancel-button" type="button" {{cancelButtonHidden}}>Cancel prep</button>
              </div>
            </div>
            <p id="message">{{escapedMessage}}</p>
            <div class="progress-stack">
              <div class="progress-card">
                <div class="progress-header">
                  <span class="progress-label">Overall progress</span>
                  <span class="progress-value" id="percent">{{snapshot.Percent}}%</span>
                </div>
                <div class="progress" aria-hidden="true">
                  <div id="progress-bar" style="width: {{snapshot.Percent}}%;"></div>
                </div>
              </div>
              <div class="progress-card">
                <div class="progress-header">
                  <span class="progress-label" id="stage-progress-label">{{escapedStage}} progress</span>
                  <span class="progress-value" id="stage-percent">{{snapshot.StagePercent}}%</span>
                </div>
                <div class="progress stage" aria-hidden="true">
                  <div id="stage-progress-bar" style="width: {{snapshot.StagePercent}}%;"></div>
                </div>
              </div>
            </div>
            <dl>
              <div>
                <dt>Stage</dt>
                <dd id="stage">{{escapedStage}}</dd>
              </div>
              <div>
                <dt>Overall</dt>
                <dd id="summary-percent">{{snapshot.Percent}}%</dd>
              </div>
              <div>
                <dt>Preview path</dt>
                <dd>{{escapedPreviewPath}}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd id="updated">{{snapshot.UpdatedAtUtc:O}}</dd>
              </div>
            </dl>
            <p class="hint" id="hint">{{escapedHint}}</p>
          </main>
          <script>
            const initialState = {{serializedSnapshot}};
            const progressBar = document.getElementById('progress-bar');
            const stageProgressBar = document.getElementById('stage-progress-bar');
            const stage = document.getElementById('stage');
            const percent = document.getElementById('percent');
            const summaryPercent = document.getElementById('summary-percent');
            const stagePercent = document.getElementById('stage-percent');
            const stageProgressLabel = document.getElementById('stage-progress-label');
            const message = document.getElementById('message');
            const updated = document.getElementById('updated');
            const hint = document.getElementById('hint');
            const cancelButton = document.getElementById('cancel-button');
            const refreshTarget = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
            const numberFormatter = new Intl.NumberFormat();
            const timeFormatter = new Intl.DateTimeFormat(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            });
            const dateFormatter = new Intl.DateTimeFormat(undefined, {
              month: 'short',
              day: 'numeric',
            });
            let eventSource;
            let cancelInFlight = false;
            let currentSnapshot = initialState;

            function getHint(snapshot) {
              if (snapshot.state === 'Failed') {
                return 'The preview host could not finish preparing this build. Fix the backing configuration or register a newer successful build, then refresh.';
              }

              if (snapshot.state === 'Cancelled') {
                return 'Preview preparation was cancelled. Refresh this page to start again.';
              }

              return 'The preview will automatically open as soon as the artifact download and extraction finish.';
            }

            function formatMessage(text) {
              return text.replace(/\d{4,}/g, (value) => numberFormatter.format(Number(value)));
            }

            function formatUpdated(value) {
              const date = new Date(value);
              if (Number.isNaN(date.getTime())) {
                return value;
              }

              return `${timeFormatter.format(date)} · ${dateFormatter.format(date)}`;
            }

            function getStageProgressLabel(snapshot) {
              return snapshot.stage ? `${snapshot.stage} progress` : 'Stage progress';
            }

            function isCancellable(snapshot) {
              return snapshot.state === 'Registered' || snapshot.state === 'Loading';
            }

            function updateCancelButton(snapshot) {
              if (!cancelButton) {
                return;
              }

              const canCancel = isCancellable(snapshot);
              cancelButton.hidden = !canCancel && !cancelInFlight;
              cancelButton.disabled = !canCancel || cancelInFlight;
              cancelButton.textContent = cancelInFlight ? 'Cancelling…' : 'Cancel prep';
            }

            function applySnapshot(snapshot) {
              currentSnapshot = snapshot;
              progressBar.style.width = `${snapshot.percent}%`;
              stageProgressBar.style.width = `${snapshot.stagePercent}%`;
              stage.textContent = snapshot.stage;
              percent.textContent = `${snapshot.percent}%`;
              summaryPercent.textContent = `${snapshot.percent}%`;
              stagePercent.textContent = `${snapshot.stagePercent}%`;
              stageProgressLabel.textContent = getStageProgressLabel(snapshot);
              message.textContent = formatMessage(snapshot.error ?? snapshot.message);
              updated.textContent = formatUpdated(snapshot.updatedAtUtc);
              hint.textContent = getHint(snapshot);
              message.classList.toggle('error', snapshot.state === 'Failed');
              updateCancelButton(snapshot);

              if (snapshot.isReady) {
                window.location.replace(refreshTarget);
              }
            }

            applySnapshot(initialState);

            eventSource = new EventSource(`/api/previews/${initialState.pullRequestNumber}/events`);
            eventSource.onmessage = (event) => {
              const snapshot = JSON.parse(event.data);
              applySnapshot(snapshot);

              if (snapshot.isReady || snapshot.state === 'Failed' || snapshot.state === 'Cancelled') {
                eventSource.close();
              }
            };

            eventSource.onerror = () => {
              hint.textContent = 'Connection interrupted. The preview host will retry automatically while the page remains open.';
            };

            cancelButton?.addEventListener('click', async () => {
              cancelInFlight = true;
              updateCancelButton(currentSnapshot);

              try {
                const response = await fetch(`/api/previews/${initialState.pullRequestNumber}/cancel`, {
                  method: 'POST',
                });

                if (!response.ok) {
                  throw new Error(`Cancel failed with status ${response.status}.`);
                }

                const snapshot = await response.json();
                eventSource?.close();
                cancelInFlight = false;
                applySnapshot(snapshot);
              } catch (error) {
                cancelInFlight = false;
                updateCancelButton(currentSnapshot);
                hint.textContent = error instanceof Error
                  ? error.message
                  : 'The preview host could not cancel the current preparation run.';
              }
            });
          </script>
        </body>
        </html>
        """;
    }

    private static string BuildIndexPage(IReadOnlyList<PreviewStatusSnapshot> snapshots, int maxActivePreviews)
    {
        var previewCards = snapshots.Count == 0
            ? """
              <article class="empty-state">
                <h2>No recent PR previews yet</h2>
                <p>Open a route like <code>/prs/{number}/</code> to resolve a PR, load its latest frontend artifact, and add it to this window.</p>
              </article>
              """
            : string.Join(Environment.NewLine, snapshots.Select(BuildPreviewCard));

        return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="icon" href="{{AspireFaviconDataUri}}">
          <title>Aspire PR previews</title>
          <style>
            :root {
              color-scheme: dark;
              --bg: #0b1020;
              --panel: rgba(13, 24, 45, 0.85);
              --border: rgba(131, 146, 190, 0.35);
              --accent: #a78bfa;
              --accent-2: #4fd1c5;
              --text: #eef2ff;
              --muted: #bac6f5;
              --ready: rgba(79, 209, 197, 0.22);
              --loading: rgba(167, 139, 250, 0.22);
              --warning: rgba(248, 113, 113, 0.2);
              --shadow: rgba(0, 0, 0, 0.35);
            }

            * { box-sizing: border-box; }

            body {
              margin: 0;
              min-height: 100vh;
              padding: 2rem;
              background:
                radial-gradient(circle at top, rgba(167, 139, 250, 0.24), transparent 32%),
                radial-gradient(circle at bottom right, rgba(79, 209, 197, 0.18), transparent 34%),
                var(--bg);
              color: var(--text);
              font-family: Inter, Segoe UI, system-ui, sans-serif;
            }

            .shell {
              width: min(72rem, 100%);
              margin: 0 auto;
              border: 1px solid var(--border);
              background: var(--panel);
              border-radius: 1.5rem;
              padding: 2rem;
              box-shadow: 0 2rem 4rem var(--shadow);
              backdrop-filter: blur(12px);
            }

            .topline {
              display: flex;
              flex-wrap: wrap;
              justify-content: space-between;
              gap: 1.5rem;
              align-items: flex-start;
            }

            .brand {
              display: flex;
              align-items: center;
              gap: 1rem;
            }

            .logo {
              flex: none;
              display: grid;
              place-items: center;
              width: 4rem;
              height: 4rem;
              border-radius: 1rem;
              background: linear-gradient(180deg, rgba(116, 85, 221, 0.28), rgba(81, 43, 212, 0.18));
              border: 1px solid rgba(151, 128, 229, 0.35);
            }

            .logo svg {
              width: 2.4rem;
              height: 2.4rem;
            }

            .eyebrow {
              text-transform: uppercase;
              letter-spacing: 0.18em;
              font-size: 0.75rem;
              color: var(--accent-2);
              margin-bottom: 0.75rem;
            }

            h1 {
              margin: 0;
              font-size: clamp(2rem, 3vw, 2.6rem);
              line-height: 1.1;
            }

            p {
              color: var(--muted);
              line-height: 1.6;
            }

            .summary {
              margin: 1rem 0 0;
              max-width: 42rem;
            }

            .window-note {
              margin: 0;
              display: grid;
              gap: 0.35rem;
              justify-items: end;
              text-align: right;
            }

            .window-note strong {
              font-size: 1rem;
            }

            code {
              font-family: Consolas, "Cascadia Code", monospace;
              font-size: 0.92em;
              background: rgba(255, 255, 255, 0.06);
              border-radius: 0.5rem;
              padding: 0.15rem 0.4rem;
            }

            .grid {
              margin-top: 1.75rem;
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
              gap: 1rem;
            }

            .preview-card,
            .empty-state {
              border-radius: 1.25rem;
              border: 1px solid rgba(255, 255, 255, 0.08);
              background: rgba(255, 255, 255, 0.03);
              padding: 1.15rem;
            }

            .card-top {
              display: flex;
              justify-content: space-between;
              gap: 1rem;
              align-items: flex-start;
            }

            .card-eyebrow {
              font-size: 0.82rem;
              color: var(--muted);
              margin-bottom: 0.45rem;
            }

            .preview-link {
              color: var(--text);
              font-size: 1.15rem;
              font-weight: 600;
              text-decoration: none;
            }

            .preview-link:hover {
              color: var(--accent-2);
            }

            .state-chip {
              display: inline-flex;
              align-items: center;
              border-radius: 999px;
              padding: 0.35rem 0.7rem;
              font-size: 0.75rem;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              white-space: nowrap;
              border: 1px solid rgba(255, 255, 255, 0.12);
            }

            .state-ready {
              background: var(--ready);
            }

            .state-loading,
            .state-registered {
              background: var(--loading);
            }

            .state-failed,
            .state-cancelled,
            .state-evicted {
              background: var(--warning);
            }

            .card-summary {
              margin: 0.9rem 0 1rem;
              min-height: 3.2rem;
            }

            .card-stats {
              margin: 0;
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 0.75rem 1rem;
            }

            dt {
              font-size: 0.72rem;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: var(--muted);
            }

            dd {
              margin: 0.35rem 0 0;
              font-size: 0.95rem;
            }

            @media (max-width: 640px) {
              body {
                padding: 1rem;
              }

              .shell {
                padding: 1.25rem;
              }

              .window-note {
                justify-items: start;
                text-align: left;
              }
            }
          </style>
        </head>
        <body>
          <main class="shell">
            <div class="topline">
              <div>
                <div class="brand">
                  <div class="logo" aria-hidden="true">{{AspireLogoSvg}}</div>
                  <div>
                    <div class="eyebrow">Aspire PR Preview</div>
                    <h1>Recent preview window</h1>
                  </div>
                </div>
                <p class="summary">These are the most recent preview routes the host is currently tracking. Open any route like <code>/prs/{number}/</code> to start or resume that PR's preview flow.</p>
              </div>
              <p class="window-note">
                <strong>Up to {{maxActivePreviews.ToString("N0", CultureInfo.InvariantCulture)}} PRs</strong>
                <span>Current entries: {{snapshots.Count.ToString("N0", CultureInfo.InvariantCulture)}}</span>
              </p>
            </div>
            <section class="grid">
              {{previewCards}}
            </section>
          </main>
          <script>
            const formatter = new Intl.DateTimeFormat(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
              month: 'short',
              day: 'numeric',
            });

            for (const timeElement of document.querySelectorAll('[data-updated]')) {
              const value = timeElement.getAttribute('data-updated');
              const date = value ? new Date(value) : null;
              if (!date || Number.isNaN(date.getTime())) {
                continue;
              }

              timeElement.textContent = formatter.format(date).replace(',', ' ·');
            }
          </script>
        </body>
        </html>
        """;
    }

    private static string BuildPreviewCard(PreviewStatusSnapshot snapshot)
    {
        var escapedPreviewPath = HtmlEncoder.Default.Encode(snapshot.PreviewPath);
        var escapedState = HtmlEncoder.Default.Encode(snapshot.State.ToString());
        var escapedStage = HtmlEncoder.Default.Encode(snapshot.Stage);
        var escapedSummary = HtmlEncoder.Default.Encode(BuildPreviewSummary(snapshot));

        return $$"""
        <article class="preview-card">
          <div class="card-top">
            <div>
              <div class="card-eyebrow">PR #{{snapshot.PullRequestNumber}}</div>
              <a class="preview-link" href="{{escapedPreviewPath}}">{{escapedPreviewPath}}</a>
            </div>
            <span class="state-chip {{BuildStateClass(snapshot.State)}}">{{escapedState}}</span>
          </div>
          <p class="card-summary">{{escapedSummary}}</p>
          <dl class="card-stats">
            <div>
              <dt>Stage</dt>
              <dd>{{escapedStage}}</dd>
            </div>
            <div>
              <dt>Overall</dt>
              <dd>{{snapshot.Percent}}%</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd><time data-updated="{{snapshot.UpdatedAtUtc:O}}">{{snapshot.UpdatedAtUtc.ToLocalTime().ToString("h:mm tt", CultureInfo.InvariantCulture)}}</time></dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{{BuildPreviewStatusText(snapshot)}}</dd>
            </div>
          </dl>
        </article>
        """;
    }

    private static string BuildPreviewSummary(PreviewStatusSnapshot snapshot) =>
        snapshot.State switch
        {
            PreviewLoadState.Ready => "The preview is ready to serve.",
            PreviewLoadState.Loading => $"{snapshot.Stage} is in progress for this preview.",
            PreviewLoadState.Registered => "A fresh preview was registered and will start loading on demand.",
            PreviewLoadState.Cancelled => "The last preparation run was cancelled. Opening the route starts it again.",
            PreviewLoadState.Failed => snapshot.Error ?? snapshot.Message,
            PreviewLoadState.Evicted => "This preview was evicted from the active window and will reload on the next visit.",
            _ => snapshot.Message
        };

    private static string BuildPreviewStatusText(PreviewStatusSnapshot snapshot) =>
        snapshot.State switch
        {
            PreviewLoadState.Ready => "Ready",
            PreviewLoadState.Loading => $"{snapshot.Percent}% overall",
            PreviewLoadState.Registered => "Queued",
            PreviewLoadState.Cancelled => "Cancelled",
            PreviewLoadState.Failed => "Attention needed",
            PreviewLoadState.Evicted => "Will reload",
            _ => snapshot.State.ToString()
        };

    private static string BuildStateClass(PreviewLoadState state) =>
        state switch
        {
            PreviewLoadState.Ready => "state-ready",
            PreviewLoadState.Loading => "state-loading",
            PreviewLoadState.Registered => "state-registered",
            PreviewLoadState.Failed => "state-failed",
            PreviewLoadState.Cancelled => "state-cancelled",
            PreviewLoadState.Evicted => "state-evicted",
            _ => string.Empty
        };

    private static string BuildInfoPage(string title, string body)
    {
        var safeTitle = WebUtility.HtmlEncode(title);
        var safeBody = WebUtility.HtmlEncode(body);

        return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="icon" href="{{AspireFaviconDataUri}}">
          <title>{{safeTitle}}</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 2rem;
              background: #0b1020;
              color: #eef2ff;
              font-family: Inter, Segoe UI, system-ui, sans-serif;
            }

            main {
              width: min(38rem, 100%);
              border: 1px solid rgba(131, 146, 190, 0.35);
              background: rgba(13, 24, 45, 0.85);
              border-radius: 1.5rem;
              padding: 2rem;
            }

            p { color: #bac6f5; line-height: 1.6; }
          </style>
        </head>
        <body>
          <main>
            <h1>{{safeTitle}}</h1>
            <p>{{safeBody}}</p>
          </main>
        </body>
        </html>
        """;
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }

    private static string BuildPullRequestUrl(PreviewStatusSnapshot snapshot)
    {
        if (string.IsNullOrWhiteSpace(snapshot.RepositoryOwner) || string.IsNullOrWhiteSpace(snapshot.RepositoryName))
        {
            return "#";
        }

        return $"https://github.com/{snapshot.RepositoryOwner}/{snapshot.RepositoryName}/pull/{snapshot.PullRequestNumber}";
    }

    private static bool ShouldRewritePreviewContent(string contentType, string previewPath)
    {
        if (string.IsNullOrWhiteSpace(previewPath) || string.Equals(previewPath, "/", StringComparison.Ordinal))
        {
            return false;
        }

        return contentType.StartsWith("text/html", StringComparison.OrdinalIgnoreCase)
            || contentType.StartsWith("text/css", StringComparison.OrdinalIgnoreCase);
    }

    private static string RewritePreviewContent(string content, string contentType, string previewPath)
    {
        var previewPrefix = NormalizePreviewPrefix(previewPath);
        if (string.IsNullOrEmpty(previewPrefix))
        {
            return content;
        }

        var previewPrefixPattern = Regex.Escape(previewPrefix.TrimStart('/'));
        var cssRootPathPattern = $@"(?<prefix>\burl\(([""']?))/(?!(?:/|{previewPrefixPattern})(?:/|$))";
        content = Regex.Replace(
            content,
            cssRootPathPattern,
            "${prefix}" + previewPrefix + "/",
            RegexOptions.IgnoreCase);

        var cssImportPattern = $@"(?<prefix>@import\s+([""']))/(?!(?:/|{previewPrefixPattern})(?:/|$))";
        content = Regex.Replace(
            content,
            cssImportPattern,
            "${prefix}" + previewPrefix + "/",
            RegexOptions.IgnoreCase);

        if (!contentType.StartsWith("text/html", StringComparison.OrdinalIgnoreCase))
        {
            return content;
        }

        var htmlRootPathPattern = $@"(?<attr>\b(?:href|src|action|poster|content|data|imagesrcset)=[""'])/(?!(?:/|{previewPrefixPattern})(?:/|$))";
        content = Regex.Replace(
            content,
            htmlRootPathPattern,
            "${attr}" + previewPrefix + "/",
            RegexOptions.IgnoreCase);

        return InjectPreviewCompatibilityScript(content, previewPrefix);
    }

    private static string InjectPreviewCompatibilityScript(string html, string previewPrefix)
    {
        const string Marker = "data-aspire-preview-bootstrap";
        if (html.Contains(Marker, StringComparison.Ordinal))
        {
            return html;
        }

        var bootstrapScript = $$"""
        <script data-aspire-preview-bootstrap>
          (() => {
            try {
              localStorage.setItem('aspire-visited', 'true');
            } catch {}

            const previewBasePath = '{{previewPrefix}}';
            window.__aspirePreviewBasePath = previewBasePath;

            document.addEventListener('click', (event) => {
              const anchor = event.target.closest('a[href]');
              if (!anchor) {
                return;
              }

              const href = anchor.getAttribute('href');
              if (!href
                || !href.startsWith('/')
                || href.startsWith('//')
                || href.startsWith(`${previewBasePath}/`)) {
                return;
              }

              anchor.setAttribute('href', `${previewBasePath}${href}`);
            }, true);
          })();
        </script>
        """;

        return html.Replace("<head>", $"<head>{bootstrapScript}", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizePreviewPrefix(string previewPath)
    {
        if (string.IsNullOrWhiteSpace(previewPath) || string.Equals(previewPath, "/", StringComparison.Ordinal))
        {
            return string.Empty;
        }

        return previewPath.EndsWith("/", StringComparison.Ordinal)
            ? previewPath[..^1]
            : previewPath;
    }

    private static string BuildHintText(PreviewStatusSnapshot snapshot) =>
        snapshot.State == PreviewLoadState.Failed
            ? "The preview host could not finish preparing this build. Fix the backing configuration or register a newer successful build, then refresh."
            : snapshot.State == PreviewLoadState.Cancelled
                ? "Preview preparation was cancelled. Refresh this page to start again."
            : "The preview will automatically open as soon as the artifact download and extraction finish.";

    private const string AspireLogoSvg = """
    <svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M28 240C12.56 240 0 227.44 0 212C0 206.968 1.328 202.072 3.84 197.832L70.544 82.296L70.816 81.888L103.744 24.792C108.744 16.152 118.032 10.792 128 10.792C137.968 10.792 147.256 16.152 152.248 24.784L252.248 197.992C254.664 202.064 255.992 206.96 255.992 211.992C255.992 227.432 243.432 239.992 227.992 239.992L28 240Z" fill="#512BD4"/>
      <path d="M202.64 144H135.92L128 130.24L105.04 90.48C104 88.72 102.56 87.2 100.64 86.16C94.96 82.8 87.6 84.8 84.24 90.56L117.6 32.8C119.68 29.2 123.52 26.8 128 26.8C132.48 26.8 136.32 29.2 138.4 32.8L171.6 90.32L171.68 90.48L171.84 90.72L202.64 144Z" fill="#7455DD"/>
      <path d="M240 212C240 218.64 234.64 224 228 224H161.36C168 224 173.36 218.64 173.36 212C173.36 209.84 172.72 207.76 171.76 206L138.4 148.24L135.92 144H202.64L238.4 206C239.44 207.76 240 209.84 240 212Z" fill="#9780E5"/>
      <path d="M173.36 212C173.36 218.64 168 224 161.36 224H94.6399C101.28 224 106.64 218.64 106.64 212C106.64 209.84 106.08 207.76 105.04 206C105.04 205.92 104.96 205.84 104.88 205.76L94.3199 188.56L70.5599 149.76C68.3999 146.24 64.5599 144 60.3199 144H135.92L138.4 148.24L139.416 150L171.76 206C172.72 207.76 173.36 209.84 173.36 212Z" fill="#B9AAEE"/>
      <path d="M106.64 212C106.64 218.64 101.28 224 94.64 224H28C21.36 224 16 218.64 16 212C16 209.84 16.56 207.76 17.6 206L49.92 150C52.08 146.32 56.08 144 60.32 144C64.56 144 68.4 146.24 70.56 149.76L94.32 188.56L104.88 205.76C104.96 205.84 105.04 205.92 105.04 206C106.08 207.76 106.64 209.84 106.64 212Z" fill="#DCD5F6"/>
      <path d="M135.92 144H60.32C56.08 144 52.08 146.32 49.92 150L53.36 144L83.92 91.12L84.24 90.64V90.56C87.6 84.8 94.96 82.8 100.64 86.16C102.56 87.2 104 88.72 105.04 90.48L128 130.24L135.92 144Z" fill="#9780E5"/>
    </svg>
    """;
}

internal static class PreviewRoute
{
    public const string CollectionPath = "/prs/";
    private const string Prefix = "/prs/";
    private const string LegacyPrefix = "/pr/";

    public static string BuildPath(int pullRequestNumber, string? relativePath = null)
    {
        var path = $"{Prefix}{pullRequestNumber}/";
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return path;
        }

        return $"{path}{relativePath.TrimStart('/')}";
    }

    public static bool IsCollectionPath(PathString path) =>
        string.Equals(path.Value, CollectionPath, StringComparison.OrdinalIgnoreCase)
        || string.Equals(path.Value, CollectionPath.TrimEnd('/'), StringComparison.OrdinalIgnoreCase);

    public static bool TryParse(PathString path, out int pullRequestNumber, out string relativePath)
        => TryParse(path.Value, Prefix, out pullRequestNumber, out relativePath);

    public static bool TryParse(string? path, out int pullRequestNumber, out string relativePath)
        => TryParse(path, Prefix, out pullRequestNumber, out relativePath);

    public static bool TryParseLegacy(PathString path, out int pullRequestNumber, out string relativePath)
        => TryParse(path.Value, LegacyPrefix, out pullRequestNumber, out relativePath);

    public static bool TryParseLegacy(string? path, out int pullRequestNumber, out string relativePath)
        => TryParse(path, LegacyPrefix, out pullRequestNumber, out relativePath);

    private static bool TryParse(string? pathValue, string prefix, out int pullRequestNumber, out string relativePath)
    {
        pullRequestNumber = default;
        relativePath = string.Empty;

        if (string.IsNullOrWhiteSpace(pathValue) || !pathValue.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var remaining = pathValue[prefix.Length..];
        var nextSlashIndex = remaining.IndexOf('/');
        var pullRequestSegment = nextSlashIndex >= 0
            ? remaining[..nextSlashIndex]
            : remaining;

        if (!int.TryParse(pullRequestSegment, out pullRequestNumber))
        {
            return false;
        }

        if (nextSlashIndex < 0)
        {
            return true;
        }

        relativePath = remaining[(nextSlashIndex + 1)..];
        if (pathValue.EndsWith('/') && !string.IsNullOrEmpty(relativePath) && !relativePath.EndsWith('/'))
        {
            relativePath = $"{relativePath}/";
        }

        return true;
    }
}

internal sealed record ResolvedPreviewFile(string FilePath, string ContentType, string CacheControl);
