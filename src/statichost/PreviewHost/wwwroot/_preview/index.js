const previewGrid = document.getElementById("preview-grid");
const windowCapacity = document.getElementById("window-capacity");
const windowCount = document.getElementById("window-count");
const availabilityFilterBar = document.getElementById("availability-filter-bar");
const authorFilterBar = document.getElementById("author-filter-bar");

const numberFormatter = new Intl.NumberFormat();
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const initialFilters = readFiltersFromQuery();

let catalogEntries = [];
let authorOptions = [];
let showPreviewableOnly = initialFilters.previewable;
let selectedAuthors = new Set(initialFilters.authors);
let activePreviewCount = 0;
let maxActivePreviews = 0;
let openPullRequestCount = 0;
let previewablePullRequestCount = 0;
let openDropdown = "";
const resettingPreviews = new Set();

availabilityFilterBar.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest("[data-filter-trigger='availability']");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  toggleDropdown("availability");
});

availabilityFilterBar.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (event.target.dataset.previewableCheckbox !== "true") {
    return;
  }

  showPreviewableOnly = event.target.checked;
  syncQueryString();
  syncAvailabilityFilter();
  renderCatalog();
});

authorFilterBar.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest("[data-filter-trigger='author']");
  if (!(button instanceof HTMLButtonElement)) {
    const clearButton = event.target.closest("[data-clear-authors]");
    if (!(clearButton instanceof HTMLButtonElement)) {
      return;
    }

    selectedAuthors = new Set();
    syncQueryString();
    syncAuthorFilter(catalogEntries);
    renderCatalog();
    return;
  }

  toggleDropdown("author");
});

authorFilterBar.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (event.target.dataset.authorCheckbox !== "true") {
    return;
  }

  const value = normalizeAuthorValue(event.target.value);
  if (!value) {
    return;
  }

  if (event.target.checked) {
    selectedAuthors.add(value);
  } else {
    selectedAuthors.delete(value);
  }

  syncQueryString();
  syncAuthorFilter(catalogEntries);
  renderCatalog();
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const path = typeof event.composedPath === "function"
    ? event.composedPath()
    : [];

  if (path.includes(availabilityFilterBar) || path.includes(authorFilterBar)) {
    return;
  }

  closeDropdowns();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDropdowns();
  }
});

previewGrid.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest("[data-reset-preview]");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const pullRequestNumber = Number(button.dataset.resetPreview);
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    return;
  }

  void resetPreview(pullRequestNumber);
});

loadCatalog().catch((error) => {
  previewGrid.setAttribute("aria-busy", "false");
  availabilityFilterBar.setAttribute("aria-busy", "false");
  authorFilterBar.setAttribute("aria-busy", "false");
  syncAvailabilityFilter();
  syncAuthorFilter([]);
  renderEmptyState(error instanceof Error ? error.message : "The preview host could not load open pull requests.");
});

setInterval(() => {
  loadCatalog().catch((error) => {
    console.error(error);
  });
}, 15000);

async function loadCatalog() {
  const response = await fetch("/api/previews/catalog", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Open pull requests request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  catalogEntries = Array.isArray(payload.entries) ? payload.entries : [];
  maxActivePreviews = payload.maxActivePreviews ?? 0;
  activePreviewCount = payload.activePreviewCount ?? 0;
  openPullRequestCount = payload.openPullRequestCount ?? catalogEntries.length;
  previewablePullRequestCount = payload.previewablePullRequestCount
    ?? catalogEntries.filter(isPreviewable).length;

  authorOptions = buildAuthorOptions(catalogEntries, selectedAuthors);
  syncAvailabilityFilter();
  syncAuthorFilter(catalogEntries);
  renderCatalog();
}

function renderCatalog() {
  const filteredEntries = applyFilters(catalogEntries);

  previewGrid.setAttribute("aria-busy", "false");
  availabilityFilterBar.setAttribute("aria-busy", "false");
  authorFilterBar.setAttribute("aria-busy", "false");

  windowCapacity.textContent = `Warm window: ${numberFormatter.format(activePreviewCount)} / ${numberFormatter.format(maxActivePreviews)}`;
  windowCount.textContent = buildWindowCountText(filteredEntries);

  if (filteredEntries.length === 0) {
    renderEmptyState(buildEmptyStateMessage());
    return;
  }

  previewGrid.innerHTML = filteredEntries.map(renderPreviewCard).join("\n");
}

function renderPreviewCard(entry) {
  const preview = entry.preview ?? null;
  const previewPath = escapeHtml(entry.previewPath ?? "/prs/");
  const title = escapeHtml(entry.title ?? `PR #${entry.pullRequestNumber}`);
  const subtitle = escapeHtml(`${getAuthorLabel(entry.authorLogin)} · Created ${formatDateOnly(entry.createdAtUtc)}`);
  const stateText = escapeHtml(buildChipLabel(preview, entry));
  const stateClass = escapeHtml(getStateClass(preview, entry));
  const statusDetail = escapeHtml(buildStatusDetail(preview, entry));
  const openPullRequestAction = entry.pullRequestUrl
    ? `
        <a class="icon-button" href="${escapeHtml(entry.pullRequestUrl)}" target="_blank" rel="noreferrer noopener" aria-label="Open pull request on GitHub">
          <span class="action-icon action-icon-github" aria-hidden="true"></span>
        </a>`
    : "";
  const draftBadge = entry.isDraft
    ? '<span class="status-chip draft">Draft</span>'
    : "";
  const resetAction = renderResetPreviewAction(entry, preview);

  return `
    <article class="preview-card">
      <div class="preview-card-topline">
        <p class="eyebrow">PR #${entry.pullRequestNumber}</p>
        <div class="preview-card-tools">
          ${draftBadge}
          ${openPullRequestAction}
        </div>
      </div>

      <a class="preview-card-link" href="${previewPath}">
        <h2 class="preview-title">${title}</h2>
        <p class="preview-card-subtitle">${subtitle}</p>
        <div class="preview-card-status-row">
          <span class="status-chip ${stateClass}">${stateText}</span>
          <span class="preview-status-detail">${statusDetail}</span>
        </div>
      </a>
      ${resetAction}
    </article>`;
}

function renderEmptyState(message) {
  previewGrid.setAttribute("aria-busy", "false");
  previewGrid.innerHTML = `
    <article class="empty-card">
      <h2>${escapeHtml(message)}</h2>
      <p class="collection-summary">Open a route like <code>/prs/{number}/</code> to resolve a PR, prepare its latest frontend artifact, and add it to the warm preview window.</p>
    </article>`;
}

function syncAuthorFilter(entries) {
  authorOptions = buildAuthorOptions(entries, selectedAuthors);
  authorFilterBar.dataset.open = openDropdown === "author" ? "true" : "false";
  authorFilterBar.innerHTML = renderDropdown({
    kind: "author",
    active: selectedAuthors.size > 0,
    open: openDropdown === "author",
    label: buildAuthorTriggerLabel(),
    meta: buildAuthorTriggerMeta(),
    menuHtml: renderAuthorFilterMenu(),
  });
}

function syncAvailabilityFilter() {
  availabilityFilterBar.dataset.open = openDropdown === "availability" ? "true" : "false";
  availabilityFilterBar.innerHTML = renderDropdown({
    kind: "availability",
    active: showPreviewableOnly,
    open: openDropdown === "availability",
    label: showPreviewableOnly ? "Previewable only" : "All previews",
    meta: showPreviewableOnly
      ? `${numberFormatter.format(previewablePullRequestCount)} matching open PRs`
      : `${numberFormatter.format(openPullRequestCount)} open PRs`,
    menuHtml: renderAvailabilityFilterMenu(),
  });
}

function renderDropdown({ kind, active, open, label, meta, menuHtml }) {
  const activeClass = active ? " is-active" : "";
  return `
    <button type="button" class="filter-trigger${activeClass}" data-filter-trigger="${kind}" aria-expanded="${open ? "true" : "false"}" aria-controls="${kind}-filter-menu">
      <span class="filter-trigger-copy">
        <span class="filter-trigger-value">${escapeHtml(label)}</span>
        <span class="filter-trigger-meta">${escapeHtml(meta)}</span>
      </span>
      <span class="filter-trigger-icon" aria-hidden="true"></span>
    </button>
    <div id="${kind}-filter-menu" class="filter-menu"${open ? "" : " hidden"}>
      ${menuHtml}
    </div>`;
}

function renderAvailabilityFilterMenu() {
  const checked = showPreviewableOnly ? " checked" : "";
  return `
    <div class="filter-menu-section">
      <label class="filter-option">
        <input class="filter-option-input" type="checkbox" value="true" data-previewable-checkbox="true"${checked}>
        <span class="filter-option-box" aria-hidden="true"></span>
        <span class="filter-option-copy">
          <span class="filter-option-title">Only show previewable PRs</span>
          <span class="filter-option-meta">Limit the catalog to pull requests whose current head has a successful frontend build artifact.</span>
        </span>
        <span class="filter-option-count">${numberFormatter.format(previewablePullRequestCount)}</span>
      </label>
    </div>`;
}

function renderAuthorFilterMenu() {
  if (authorOptions.length === 0) {
    return '<div class="filter-menu-empty">No open pull request authors are available right now.</div>';
  }

  const footer = selectedAuthors.size > 0
    ? `
      <div class="filter-menu-footer">
        <button type="button" class="filter-menu-action" data-clear-authors>Clear selections</button>
      </div>`
    : "";

  return `
    <div class="filter-menu-section">
      ${authorOptions.map(renderAuthorOption).join("\n")}
    </div>
    ${footer}`;
}

function renderAuthorOption(option) {
  const checked = selectedAuthors.has(option.value) ? " checked" : "";
  const emptyClass = option.count === 0 ? " is-empty" : "";
  return `
    <label class="filter-option${emptyClass}">
      <input class="filter-option-input" type="checkbox" value="${escapeHtml(option.value)}" data-author-checkbox="true"${checked}>
      <span class="filter-option-box" aria-hidden="true"></span>
      <span class="filter-option-copy">
        <span class="filter-option-title">${escapeHtml(option.label)}</span>
        <span class="filter-option-meta">${escapeHtml(buildAuthorOptionMeta(option.count))}</span>
      </span>
      <span class="filter-option-count">${numberFormatter.format(option.count)}</span>
    </label>`;
}

function renderResetPreviewAction(entry, preview) {
  if (!preview) {
    return "";
  }

  const pullRequestNumber = Number(entry.pullRequestNumber);
  const isResetting = resettingPreviews.has(pullRequestNumber);
  const label = isResetting ? "Resetting..." : "Reset preview";
  const disabled = isResetting ? " disabled" : "";

  return `
    <div class="preview-card-footer">
      <div class="preview-card-actions">
        <button type="button" class="action-button secondary preview-card-reset"${disabled} data-reset-preview="${pullRequestNumber}">
          ${escapeHtml(label)}
        </button>
      </div>
    </div>`;
}

function buildAuthorOptions(entries, activeAuthors) {
  const counts = new Map();
  const options = [];

  for (const entry of entries) {
    const value = getAuthorValue(entry.authorLogin);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  for (const [value, count] of counts) {
    options.push({
      value,
      label: getAuthorLabelFromValue(value),
      count,
    });
  }

  for (const value of activeAuthors) {
    if (counts.has(value)) {
      continue;
    }

    options.push({
      value,
      label: getAuthorLabelFromValue(value),
      count: 0,
    });
  }

  return options.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
}

function applyFilters(entries) {
  return entries.filter((entry) => {
    if (showPreviewableOnly && !isPreviewable(entry)) {
      return false;
    }

    if (selectedAuthors.size > 0 && !selectedAuthors.has(getAuthorValue(entry.authorLogin))) {
      return false;
    }

    return true;
  });
}

function getAuthorValue(authorLogin) {
  return normalizeAuthorValue(authorLogin) || "unknown";
}

function getAuthorLabel(authorLogin) {
  return getAuthorLabelFromValue(getAuthorValue(authorLogin));
}

function getAuthorLabelFromValue(value) {
  return value === "unknown"
    ? "Unknown"
    : `@${value}`;
}

function buildStatusDetail(preview, entry) {
  if (!preview) {
    return isPreviewable(entry)
      ? "Loads on first visit."
      : "No successful frontend build artifact is available for the current head yet.";
  }

  if (preview.headSha && entry.headSha && preview.headSha !== entry.headSha) {
    return isPreviewable(entry)
      ? "New commits are ready to warm from the latest frontend build."
      : "New commits are waiting for a successful frontend build.";
  }

  switch (preview.state) {
    case "Ready":
      return "Served from the warm window.";
    case "Loading":
      return preview.stage ? `${preview.stage} · ${preview.percent ?? 0}%` : `${preview.percent ?? 0}%`;
    case "Registered":
      return "Latest build is queued to warm.";
    case "Cancelled":
      return "Preparation was cancelled.";
    case "Failed":
      return preview.error ?? preview.message ?? "The preview host could not finish preparing this build.";
    case "Evicted":
      return "Loads again on the next visit.";
    default:
      return preview.message ?? "Waiting for preview activity.";
  }
}

function buildChipLabel(preview, entry) {
  if (!preview) {
    return isPreviewable(entry) ? "On demand" : "Waiting on CI";
  }

  if (preview.headSha && entry.headSha && preview.headSha !== entry.headSha) {
    return isPreviewable(entry) ? "Outdated" : "Waiting on CI";
  }

  switch (preview.state) {
    case "Ready":
      return "Ready";
    case "Loading":
      return "Preparing";
    case "Registered":
      return "Queued";
    case "Cancelled":
      return "Cancelled";
    case "Failed":
      return "Failed";
    case "Evicted":
      return "Evicted";
    default:
      return preview.state ?? "Unknown";
  }
}

function getStateClass(preview, entry) {
  if (!preview) {
    return isPreviewable(entry) ? "missing" : "registered";
  }

  if (preview.headSha && entry.headSha && preview.headSha !== entry.headSha) {
    return isPreviewable(entry) ? "outdated" : "registered";
  }

  return String(preview.state ?? "missing").toLowerCase();
}

function isPreviewable(entry) {
  const preview = entry.preview ?? null;
  if (preview && preview.headSha && entry.headSha && preview.headSha === entry.headSha) {
    return true;
  }

  return entry.hasSuccessfulPreviewBuild === true;
}

function buildWindowCountText(filteredEntries) {
  if (showPreviewableOnly && selectedAuthors.size > 0) {
    return `Showing ${numberFormatter.format(filteredEntries.length)} previewable PRs for ${buildSelectedAuthorSummary()}`;
  }

  if (showPreviewableOnly) {
    return `Showing ${numberFormatter.format(filteredEntries.length)} of ${numberFormatter.format(openPullRequestCount)} open PRs with a successful frontend build`;
  }

  if (selectedAuthors.size > 0) {
    return `Showing ${numberFormatter.format(filteredEntries.length)} of ${numberFormatter.format(openPullRequestCount)} open PRs for ${buildSelectedAuthorSummary()}`;
  }

  return `Open PRs: ${numberFormatter.format(openPullRequestCount)}`;
}

function buildEmptyStateMessage() {
  if (showPreviewableOnly && selectedAuthors.size > 0) {
    return `No previewable open pull requests match ${buildSelectedAuthorSummary()}.`;
  }

  if (showPreviewableOnly) {
    return "No open pull requests have a successful frontend build artifact right now.";
  }

  if (selectedAuthors.size > 0) {
    return `No open pull requests match ${buildSelectedAuthorSummary()}.`;
  }

  return "No open pull requests need previews right now.";
}

function buildAuthorTriggerLabel() {
  if (selectedAuthors.size === 0) {
    return "All authors";
  }

  if (selectedAuthors.size === 1) {
    return getAuthorLabelFromValue([...selectedAuthors][0]);
  }

  return `${numberFormatter.format(selectedAuthors.size)} authors selected`;
}

function buildAuthorTriggerMeta() {
  if (selectedAuthors.size === 0) {
    if (authorOptions.length === 0) {
      return "No authors available";
    }

    return authorOptions.length === 1
      ? "1 author available"
      : `${numberFormatter.format(authorOptions.length)} authors available`;
  }

  return selectedAuthors.size === 1
    ? "1 author selected"
    : `${numberFormatter.format(selectedAuthors.size)} authors selected`;
}

function buildAuthorOptionMeta(count) {
  if (count === 0) {
    return "No open pull requests right now";
  }

  return count === 1
    ? "1 open pull request"
    : `${numberFormatter.format(count)} open pull requests`;
}

function buildSelectedAuthorSummary() {
  const labels = [...selectedAuthors]
    .map(getAuthorLabelFromValue)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

  if (labels.length === 0) {
    return "the selected authors";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${numberFormatter.format(labels.length)} authors`;
}

function toggleDropdown(name) {
  openDropdown = openDropdown === name ? "" : name;
  syncAvailabilityFilter();
  syncAuthorFilter(catalogEntries);
}

function closeDropdowns() {
  if (!openDropdown) {
    return;
  }

  openDropdown = "";
  syncAvailabilityFilter();
  syncAuthorFilter(catalogEntries);
}

function readFiltersFromQuery() {
  const searchParams = new URLSearchParams(window.location.search);
  const previewable = searchParams.has("previewable")
    ? normalizeBooleanQuery(searchParams.get("previewable"))
    : true;
  const authors = new Set();
  const rawAuthors = searchParams.get("author");

  if (rawAuthors) {
    for (const value of rawAuthors.split(",")) {
      const normalized = normalizeAuthorValue(value);
      if (normalized) {
        authors.add(normalized);
      }
    }
  }

  return {
    previewable,
    authors,
  };
}

function normalizeBooleanQuery(value) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeAuthorValue(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^author:/, "")
    .replace(/^@/, "");

  return normalized;
}

function syncQueryString() {
  const url = new URL(window.location.href);

  url.searchParams.set("previewable", showPreviewableOnly ? "true" : "false");

  if (selectedAuthors.size > 0) {
    url.searchParams.set("author", [...selectedAuthors].sort().join(","));
  } else {
    url.searchParams.delete("author");
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function resetPreview(pullRequestNumber) {
  if (resettingPreviews.has(pullRequestNumber)) {
    return;
  }

  if (!window.confirm(`Reset preview for PR #${pullRequestNumber}? This clears the cached preview so the next visit has to prepare it again.`)) {
    return;
  }

  resettingPreviews.add(pullRequestNumber);
  renderCatalog();

  try {
    const response = await fetch(`/api/previews/${pullRequestNumber}/reset`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Preview reset request failed with status ${response.status}.`);
    }

    await loadCatalog();
  } catch (error) {
    console.error(error);
    window.alert(error instanceof Error
      ? error.message
      : "The preview host could not reset this preview.");
  } finally {
    resettingPreviews.delete(pullRequestNumber);
    renderCatalog();
  }
}

function formatDateOnly(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Waiting" : dateFormatter.format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
