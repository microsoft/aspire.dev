const routeMatch = window.location.pathname.match(/^\/prs\/(\d+)(?:\/.*)?$/i);
const pullRequestNumber = routeMatch ? Number(routeMatch[1]) : null;
const refreshTarget = pullRequestNumber ? `/prs/${pullRequestNumber}/` : "/prs/";

const pageTitle = document.getElementById("page-title");
const message = document.getElementById("message");
const progressSection = document.getElementById("progress-section");
const terminalSection = document.getElementById("terminal-section");
const terminalChip = document.getElementById("terminal-chip");
const terminalSummary = document.getElementById("terminal-summary");
const statusValue = document.getElementById("status-value");
const overallSummary = document.getElementById("overall-summary");
const previewPath = document.getElementById("preview-path");
const updatedAt = document.getElementById("updated-at");
const cardBusyIndicator = document.getElementById("card-busy-indicator");
const downloadDetailGroup = document.getElementById("download-detail-group");
const downloadDetail = document.getElementById("download-detail");
const extractDetailGroup = document.getElementById("extract-detail-group");
const extractDetail = document.getElementById("extract-detail");
const hint = document.getElementById("hint");
const overallProgressValue = document.getElementById("overall-progress-value");
const stageProgressLabel = document.getElementById("stage-progress-label");
const stageProgressValue = document.getElementById("stage-progress-value");
const overallProgressBar = document.getElementById("overall-progress-bar");
const stageProgressBar = document.getElementById("stage-progress-bar");
const statusCardActions = document.getElementById("status-card-actions");
const openPrLink = document.getElementById("open-pr-link");
const cancelButton = document.getElementById("cancel-button");
const retryButton = document.getElementById("retry-button");
const retryButtonLabel = retryButton?.querySelector(".button-label");
const signoutLink = document.getElementById("signout-link");
const viewerSummary = document.getElementById("viewer-summary");
const viewerAvatar = document.getElementById("viewer-avatar");
const viewerName = document.getElementById("viewer-name");

const numberFormatter = new Intl.NumberFormat();
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const clockFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

let currentState = null;
let eventSource = null;
let prepareInFlight = false;
let cancelInFlight = false;
let suppressCloseCancellation = false;
let closeCancellationSent = false;
let sessionInfo = null;
const downloadRateTracker = createRateTracker();
const extractionRateTracker = createRateTracker();

initializeShell();
window.addEventListener("pagehide", cancelIfClosingDuringPreparation);
window.addEventListener("beforeunload", cancelIfClosingDuringPreparation);
document.addEventListener("click", preservePreparationWhenReturningToCatalog);

void initialize();

async function initialize() {
  try {
    await loadSession();
    await preparePreview();
  } catch (error) {
    applyState(buildFailureState(error instanceof Error ? error.message : "The preview host could not load the preview status."));
  }
}

cancelButton.addEventListener("click", async () => {
  if (!pullRequestNumber || cancelInFlight) {
    return;
  }

  cancelInFlight = true;
  updateActionButtons();

  try {
    const response = await fetch(`/api/previews/${pullRequestNumber}/cancel`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: getCsrfHeaders({
        "Accept": "application/json",
      }),
    });

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (response.status === 403) {
      window.location.replace("/auth/access-denied");
      return;
    }

    if (!response.ok) {
      throw new Error(`Cancel failed with status ${response.status}.`);
    }

    closeEventSource();
    applyState(await response.json());
  } catch (error) {
    hint.textContent = error instanceof Error
      ? error.message
      : "The preview host could not cancel the current preparation run.";
  } finally {
    cancelInFlight = false;
    updateActionButtons();
  }
});

retryButton.addEventListener("click", async () => {
  try {
    await preparePreview();
  } catch (error) {
    hint.textContent = error instanceof Error
      ? error.message
      : "The preview host could not restart preview preparation.";
  }
});

async function loadSession() {
  const response = await fetch("/api/previews/session", {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Sign in with GitHub to prepare previews.");
  }

  if (response.status === 403) {
    window.location.replace("/auth/access-denied");
    throw new Error("Preview access denied.");
  }

  if (!response.ok) {
    throw new Error(`Session request failed with status ${response.status}.`);
  }

  sessionInfo = await response.json();
  applySession(sessionInfo);
}

function applySession(session) {
  if (signoutLink && typeof session?.signOutPath === "string" && session.signOutPath) {
    signoutLink.href = session.signOutPath;
    signoutLink.hidden = false;
  }

  if (!viewerSummary || !viewerName) {
    return;
  }

  const displayName = session?.viewer?.displayName || session?.viewer?.login || "Signed in";
  const login = session?.viewer?.login ? `@${session.viewer.login}` : "GitHub repo writer";
  viewerName.textContent = displayName;
  viewerName.title = login;

  const roleElement = viewerSummary.querySelector(".viewer-role");
  if (roleElement) {
    roleElement.textContent = login;
  }

  if (viewerAvatar && session?.viewer?.avatarUrl) {
    viewerAvatar.src = session.viewer.avatarUrl;
    viewerAvatar.hidden = false;
  }

  viewerSummary.hidden = false;
}

async function preparePreview() {
  if (!pullRequestNumber || prepareInFlight) {
    return;
  }

  prepareInFlight = true;
  updateActionButtons();
  suppressCloseCancellation = false;
  closeEventSource();

  try {
    const response = await fetch(`/api/previews/${pullRequestNumber}/prepare`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: getCsrfHeaders({
        "Accept": "application/json",
      }),
    });
    const payload = await readJsonSafely(response);

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (response.status === 403) {
      window.location.replace("/auth/access-denied");
      return;
    }

    if (response.status === 404) {
      applyState(buildFailureState(
        payload?.failureMessage ?? "The preview host could not find a successful frontend build for this pull request yet.",
        payload ?? {},
      ));
      return;
    }

    if (!response.ok) {
      throw new Error(`Preview request failed with status ${response.status}.`);
    }

    applyState(payload);
    connectEventsIfNeeded(payload);
  } finally {
    prepareInFlight = false;
    updateActionButtons();
  }
}

function connectEventsIfNeeded(snapshot) {
  if (!pullRequestNumber || !isActiveState(snapshot.state)) {
    return;
  }

  eventSource = new EventSource(`/api/previews/${pullRequestNumber}/events`);
  eventSource.onmessage = (event) => {
    const snapshotUpdate = JSON.parse(event.data);
    applyState(snapshotUpdate);

    if (snapshotUpdate.isReady || isTerminalState(snapshotUpdate.state)) {
      closeEventSource();
    }
  };

  eventSource.onerror = () => {
    if (currentState && isActiveState(currentState.state)) {
      hint.textContent = "Connection interrupted. The page will reconnect while the preview is still preparing.";
    }
  };
}

function applyState(snapshot) {
  currentState = snapshot;
  closeCancellationSent = false;

  if (snapshot.isReady) {
    suppressCloseCancellation = true;
    closeEventSource();
    window.location.replace(buildContentUrl(snapshot.previewPath ?? refreshTarget));
    return;
  }

  const statusLabel = getStatusLabel(snapshot.state);
  const titleLabel = getTitle(snapshot);
  const overallPercent = snapshot.percent ?? 0;
  const stagePercent = snapshot.stagePercent ?? 0;
  const activeState = isActiveState(snapshot.state);
  const terminalState = isTerminalState(snapshot.state) || snapshot.state === "Missing";
  const text = formatMessage(snapshot.error ?? snapshot.message ?? snapshot.failureMessage ?? "Waiting for preview status.");
  const downloadRate = updateRateTracker(
    downloadRateTracker,
    activeState && snapshot.stage === "Downloading",
    snapshot.bytesDownloaded,
  );
  const extractionRate = updateRateTracker(
    extractionRateTracker,
    activeState && snapshot.itemsLabel === "files",
    snapshot.itemsCompleted,
  );
  const downloadText = getDownloadText(snapshot, downloadRate);
  const extractionText = getExtractionText(snapshot, extractionRate);

  document.title = titleLabel;
  pageTitle.textContent = titleLabel;
  message.textContent = text;
  message.hidden = terminalState;
  message.classList.toggle("error", terminalState && snapshot.state !== "Cancelled");
  progressSection.hidden = !activeState;
  terminalSection.hidden = !terminalState;
  cardBusyIndicator.hidden = !activeState;
  statusValue.textContent = statusLabel;
  overallSummary.textContent = activeState ? `${overallPercent}%` : statusLabel;
  previewPath.textContent = snapshot.previewPath ?? refreshTarget;
  updatedAt.textContent = snapshot.updatedAtUtc ? formatUpdated(snapshot.updatedAtUtc) : "Waiting";
  downloadDetailGroup.hidden = !downloadText;
  downloadDetail.textContent = downloadText ?? "Waiting";
  extractDetailGroup.hidden = !extractionText;
  extractDetail.textContent = extractionText ?? "Waiting";
  hint.textContent = getHint(snapshot);

  overallProgressValue.textContent = `${overallPercent}%`;
  stageProgressLabel.textContent = getStageProgressLabel(snapshot);
  stageProgressValue.textContent = `${stagePercent}%`;
  overallProgressBar.style.width = `${overallPercent}%`;
  stageProgressBar.style.width = `${stagePercent}%`;

  terminalChip.textContent = statusLabel;
  terminalChip.className = `status-chip ${getStateClassName(snapshot.state)}`;
  terminalSummary.textContent = terminalState ? text : "";
  terminalSummary.classList.toggle("error", terminalState && snapshot.state !== "Cancelled");

  updateOpenPrLink(snapshot);
  updateActionButtons();
}

function initializeShell() {
  if (!pullRequestNumber) {
    return;
  }

  const initialTitle = `Preparing PR #${pullRequestNumber}`;
  document.title = initialTitle;
  pageTitle.textContent = initialTitle;
  message.textContent = "Checking GitHub for the latest successful frontend artifact you can preview.";
  message.hidden = false;
  cardBusyIndicator.hidden = false;
  previewPath.textContent = refreshTarget;
  hint.textContent = "This page prepares the latest successful build for this PR every time you open it.";
}

function updateOpenPrLink(snapshot) {
  const repositoryOwner = snapshot.repositoryOwner;
  const repositoryName = snapshot.repositoryName;
  if (!repositoryOwner || !repositoryName || !pullRequestNumber) {
    openPrLink.hidden = true;
    return;
  }

  openPrLink.href = `https://github.com/${repositoryOwner}/${repositoryName}/pull/${pullRequestNumber}`;
  openPrLink.hidden = false;
}

function updateActionButtons() {
  const canCancel = currentState && isActiveState(currentState.state);
  const canRetry = currentState && (isTerminalState(currentState.state) || currentState.state === "Missing");
  const retryLabel = currentState?.state === "Missing"
    ? "Check latest build"
    : "Retry prep";

  cancelButton.hidden = !canCancel && !cancelInFlight;
  cancelButton.disabled = !canCancel || cancelInFlight;
  cancelButton.textContent = cancelInFlight ? "Cancelling..." : "Cancel prep";

  retryButton.hidden = !canRetry && !prepareInFlight;
  retryButton.disabled = prepareInFlight || (!canRetry && !prepareInFlight);
  if (retryButtonLabel) {
    retryButtonLabel.textContent = prepareInFlight ? "Checking..." : retryLabel;
  }

  if (statusCardActions) {
    statusCardActions.hidden = openPrLink.hidden && cancelButton.hidden && retryButton.hidden;
  }
}

function buildFailureState(messageText, payload = {}) {
  return {
    pullRequestNumber: payload.pullRequestNumber ?? pullRequestNumber ?? 0,
    state: payload.state ?? "Missing",
    stage: payload.stage ?? "Failed",
    message: payload.message ?? messageText,
    error: payload.error ?? messageText,
    percent: payload.percent ?? 0,
    stagePercent: payload.stagePercent ?? 100,
    bytesDownloaded: payload.bytesDownloaded ?? null,
    bytesTotal: payload.bytesTotal ?? null,
    itemsCompleted: payload.itemsCompleted ?? null,
    itemsTotal: payload.itemsTotal ?? null,
    itemsLabel: payload.itemsLabel ?? null,
    updatedAtUtc: payload.updatedAtUtc ?? new Date().toISOString(),
    previewPath: payload.previewPath ?? refreshTarget,
    repositoryOwner: payload.repositoryOwner ?? null,
    repositoryName: payload.repositoryName ?? null,
    isReady: false,
  };
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function closeEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function preservePreparationWhenReturningToCatalog(event) {
  if (!(event.target instanceof Element) || event.defaultPrevented) {
    return;
  }

  const link = event.target.closest("a[data-preserve-preparation='true']");
  if (!(link instanceof HTMLAnchorElement)) {
    return;
  }

  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  if (link.target && link.target !== "_self") {
    return;
  }

  suppressCloseCancellation = true;
}

function cancelIfClosingDuringPreparation() {
  if (!pullRequestNumber
    || suppressCloseCancellation
    || closeCancellationSent
    || prepareInFlight
    || cancelInFlight
    || !currentState
    || !isActiveState(currentState.state)) {
    return;
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    return;
  }

  closeCancellationSent = true;
  const cancelUrl = `/api/previews/${pullRequestNumber}/cancel`;
  const payload = new URLSearchParams({
    "__RequestVerificationToken": csrfToken,
  });

  if (typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(cancelUrl, payload);
    return;
  }

  fetch(cancelUrl, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    keepalive: true,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: payload,
  }).catch(() => {
  });
}

function isActiveState(state) {
  return state === "Registered" || state === "Loading";
}

function isTerminalState(state) {
  return state === "Failed" || state === "Cancelled" || state === "Evicted";
}

function getStatusLabel(state) {
  switch (state) {
    case "Registered":
      return "Queued";
    case "Loading":
      return "Preparing";
    case "Ready":
      return "Ready";
    case "Failed":
      return "Failed";
    case "Cancelled":
      return "Cancelled";
    case "Evicted":
      return "Evicted";
    case "Missing":
      return "Unavailable";
    default:
      return state ?? "Preparing";
  }
}

function getTitle(snapshot) {
  const number = snapshot.pullRequestNumber ?? pullRequestNumber ?? "?";
  if (snapshot.state === "Failed" || snapshot.state === "Missing") {
    return `PR #${number} preview unavailable`;
  }

  if (snapshot.state === "Cancelled") {
    return `PR #${number} prep cancelled`;
  }

  if (snapshot.state === "Ready") {
    return `Opening PR #${number} preview`;
  }

  return `Preparing PR #${number}`;
}

function getHint(snapshot) {
  if (snapshot.state === "Missing") {
    return "Wait for CI to publish a successful frontend build, then check again.";
  }

  if (snapshot.state === "Failed") {
    return "Retry to ask GitHub for the latest successful build again.";
  }

  if (snapshot.state === "Cancelled") {
    return "Retry when you are ready to prepare the latest build again.";
  }

  if (snapshot.state === "Evicted") {
    return "Retry to move this PR back into the warm preview window.";
  }

  return "This page will open the preview automatically as soon as preparation finishes.";
}

function getStateClassName(state) {
  return String(state ?? "missing").toLowerCase();
}

function getStageProgressLabel(snapshot) {
  if (snapshot.stage === "Downloading") {
    return "Downloading preview artifact";
  }

  if (snapshot.stage === "Extracting" && snapshot.itemsLabel === "files") {
    return "Extracting preview files";
  }

  return snapshot.stage ? `${snapshot.stage} progress` : "Stage progress";
}

function formatMessage(text) {
  return String(text).replace(/\d{4,}/g, (value) => numberFormatter.format(Number(value)));
}

function formatUpdated(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${dateFormatter.format(date)} · ${clockFormatter.format(date)}`;
}

function getDownloadText(snapshot, bytesPerSecond) {
  if (!Number.isFinite(snapshot.bytesDownloaded) && !Number.isFinite(snapshot.bytesTotal)) {
    return null;
  }

  const parts = [];

  if (Number.isFinite(snapshot.bytesDownloaded) && Number.isFinite(snapshot.bytesTotal) && snapshot.bytesTotal > 0) {
    parts.push(`${formatBytes(snapshot.bytesDownloaded)} / ${formatBytes(snapshot.bytesTotal)}`);
  } else if (Number.isFinite(snapshot.bytesDownloaded)) {
    parts.push(`${formatBytes(snapshot.bytesDownloaded)} downloaded`);
  }

  if (snapshot.stage === "Downloading" && Number.isFinite(bytesPerSecond) && bytesPerSecond > 0) {
    parts.push(`${formatBytes(bytesPerSecond)}/s`);
  }

  return parts.join(" · ");
}

function getExtractionText(snapshot, itemsPerSecond) {
  if (snapshot.itemsLabel !== "files" || !Number.isFinite(snapshot.itemsCompleted) && !Number.isFinite(snapshot.itemsTotal)) {
    return null;
  }

  const completed = Number.isFinite(snapshot.itemsCompleted)
    ? numberFormatter.format(snapshot.itemsCompleted)
    : "0";
  const total = Number.isFinite(snapshot.itemsTotal) && snapshot.itemsTotal > 0
    ? ` / ${numberFormatter.format(snapshot.itemsTotal)}`
    : "";

  const parts = [`${completed}${total} files`];
  if (Number.isFinite(itemsPerSecond) && itemsPerSecond > 0) {
    parts.push(`${formatUnitRate(itemsPerSecond)} files/s`);
  }

  return parts.join(" · ");
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function createRateTracker() {
  return {
    samples: [],
    lastRate: null,
    lastRateUpdatedAt: 0,
  };
}

function updateRateTracker(tracker, isActive, value) {
  const now = Date.now();

  if (!isActive || !Number.isFinite(value) || Number(value) < 0) {
    tracker.samples = [];
    return now - tracker.lastRateUpdatedAt <= 10000
      ? tracker.lastRate
      : null;
  }

  const numericValue = Number(value);
  const lastSample = tracker.samples[tracker.samples.length - 1];

  if (lastSample && numericValue < lastSample.value) {
    tracker.samples = [];
  }

  if (!lastSample || numericValue !== lastSample.value || now - lastSample.time >= 500) {
    tracker.samples.push({ time: now, value: numericValue });
  }

  while (tracker.samples.length > 0 && now - tracker.samples[0].time > 8000) {
    tracker.samples.shift();
  }

  const firstSample = tracker.samples[0];
  const newestSample = tracker.samples[tracker.samples.length - 1];
  if (!firstSample || !newestSample || newestSample.time <= firstSample.time || newestSample.value <= firstSample.value) {
    return now - tracker.lastRateUpdatedAt <= 10000
      ? tracker.lastRate
      : null;
  }

  tracker.lastRate = (newestSample.value - firstSample.value) / ((newestSample.time - firstSample.time) / 1000);
  tracker.lastRateUpdatedAt = now;
  return tracker.lastRate;
}

function formatUnitRate(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "0";
  }

  if (numericValue >= 100) {
    return numberFormatter.format(Math.round(numericValue));
  }

  if (numericValue >= 10) {
    return numericValue.toFixed(1);
  }

  return numericValue.toFixed(2);
}

function buildContentUrl(relativePath) {
  try {
    return new URL(relativePath, sessionInfo?.contentBaseUrl ?? window.location.origin).toString();
  } catch {
    return relativePath;
  }
}

function redirectToLogin() {
  const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
}

function getCsrfHeaders(additionalHeaders = {}) {
  const headers = { ...additionalHeaders };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers["X-Preview-Csrf"] = csrfToken;
  }

  return headers;
}

function getCsrfToken() {
  const encodedName = encodeURIComponent("previewhost-csrf");
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== encodedName && rawName !== "previewhost-csrf") {
      continue;
    }

    return decodeURIComponent(rawValue.join("="));
  }

  return "";
}
