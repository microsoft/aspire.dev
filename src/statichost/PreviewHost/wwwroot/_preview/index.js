const previewGrid = document.getElementById("preview-grid");
const windowCapacity = document.getElementById("window-capacity");
const windowCount = document.getElementById("window-count");

const numberFormatter = new Intl.NumberFormat();
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  month: "short",
  day: "numeric",
});

loadRecentSnapshots().catch((error) => {
  renderEmptyState(error instanceof Error ? error.message : "The preview host could not load recent previews.");
});

async function loadRecentSnapshots() {
  const response = await fetch("/api/previews/recent", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Recent previews request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  const maxActivePreviews = payload.maxActivePreviews ?? snapshots.length;

  windowCapacity.textContent = `Up to ${numberFormatter.format(maxActivePreviews)} PRs`;
  windowCount.textContent = `Current entries: ${numberFormatter.format(snapshots.length)}`;

  if (snapshots.length === 0) {
    renderEmptyState("No recent PR previews yet.");
    return;
  }

  previewGrid.innerHTML = snapshots.map(renderPreviewCard).join("\n");
}

function renderPreviewCard(snapshot) {
  const previewPath = escapeHtml(snapshot.previewPath ?? "/prs/");
  const summary = escapeHtml(buildSummary(snapshot));
  const stage = escapeHtml(snapshot.stage ?? "Waiting");
  const statusText = escapeHtml(buildStatusText(snapshot));
  const stateText = escapeHtml(snapshot.state ?? "Unknown");
  const updated = escapeHtml(formatUpdated(snapshot.updatedAtUtc));
  const stateClass = String(snapshot.state ?? "missing").toLowerCase();
  const overall = escapeHtml(buildOverallDisplay(snapshot));

  return `
    <article class="preview-card">
      <header class="preview-card-header">
        <div>
          <p class="eyebrow">PR #${snapshot.pullRequestNumber}</p>
          <a class="preview-link" href="${previewPath}">${previewPath}</a>
        </div>
        <span class="status-chip ${stateClass}">${stateText}</span>
      </header>

      <p class="preview-summary">${summary}</p>

      <dl class="preview-meta">
        <div>
          <dt>Stage</dt>
          <dd>${stage}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>${statusText}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>${updated}</dd>
        </div>
        <div>
          <dt>Overall</dt>
          <dd>${overall}</dd>
        </div>
      </dl>
    </article>`;
}

function renderEmptyState(message) {
  previewGrid.innerHTML = `
    <article class="empty-card">
      <h2>${escapeHtml(message)}</h2>
      <p class="collection-summary">Open a route like <code>/prs/{number}/</code> to resolve a PR, prepare its latest frontend artifact, and add it here.</p>
    </article>`;
}

function buildSummary(snapshot) {
  switch (snapshot.state) {
    case "Ready":
      return "The preview is ready to serve.";
    case "Loading":
      return `${snapshot.stage} is in progress for this preview.`;
    case "Registered":
      return "A fresh preview was registered and will start loading on demand.";
    case "Cancelled":
      return "The previous preparation run was cancelled. Retry from the preview page when you are ready.";
    case "Failed":
      return snapshot.error ?? snapshot.message ?? "The preview host could not finish preparing this build.";
    case "Evicted":
      return "This preview was evicted from the active window and will prepare again on the next visit.";
    default:
      return snapshot.message ?? "Waiting for preview activity.";
  }
}

function buildStatusText(snapshot) {
  switch (snapshot.state) {
    case "Ready":
      return "Ready";
    case "Loading":
      return `${snapshot.percent ?? 0}% overall`;
    case "Registered":
      return "Queued";
    case "Cancelled":
      return "Cancelled";
    case "Failed":
      return "Attention needed";
    case "Evicted":
      return "Will reload";
    default:
      return snapshot.state ?? "Unknown";
  }
}

function buildOverallDisplay(snapshot) {
  return snapshot.state === "Loading" || snapshot.state === "Registered"
    ? `${snapshot.percent ?? 0}%`
    : buildStatusText(snapshot);
}

function formatUpdated(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Waiting" : timeFormatter.format(date).replace(",", " -");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
