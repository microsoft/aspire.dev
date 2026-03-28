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
const hint = document.getElementById("hint");
const overallProgressValue = document.getElementById("overall-progress-value");
const stageProgressLabel = document.getElementById("stage-progress-label");
const stageProgressValue = document.getElementById("stage-progress-value");
const overallProgressBar = document.getElementById("overall-progress-bar");
const stageProgressBar = document.getElementById("stage-progress-bar");
const openPrLink = document.getElementById("open-pr-link");
const cancelButton = document.getElementById("cancel-button");
const retryButton = document.getElementById("retry-button");
const retryButtonLabel = retryButton?.querySelector(".button-label");

const numberFormatter = new Intl.NumberFormat();
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  month: "short",
  day: "numeric",
});

let currentState = null;
let eventSource = null;
let retryInFlight = false;
let cancelInFlight = false;

bootstrap().catch((error) => {
  applyState(buildFailureState(error instanceof Error ? error.message : "The preview host could not load the preview status."));
});

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
    });

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
  if (!pullRequestNumber || retryInFlight) {
    return;
  }

  retryInFlight = true;
  updateActionButtons();

  try {
    const response = await fetch(`/api/previews/${pullRequestNumber}/retry`, {
      method: "POST",
      cache: "no-store",
    });

    if (!response.ok && response.status !== 202) {
      throw new Error(`Retry failed with status ${response.status}.`);
    }

    await bootstrap();
  } catch (error) {
    hint.textContent = error instanceof Error
      ? error.message
      : "The preview host could not restart preview preparation.";
  } finally {
    retryInFlight = false;
    updateActionButtons();
  }
});

async function bootstrap() {
  if (!pullRequestNumber) {
    applyState(buildFailureState("This route does not contain a valid pull request number."));
    return;
  }

  closeEventSource();

  const response = await fetch(`/api/previews/${pullRequestNumber}/bootstrap`, {
    cache: "no-store",
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    applyState(buildFailureState(payload?.failureMessage ?? "The preview host could not find a successful frontend build for this pull request yet.", payload));
    return;
  }

  applyState(payload);
  connectEventsIfNeeded(payload);
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

  if (snapshot.isReady) {
    window.location.replace(refreshTarget);
    return;
  }

  const statusLabel = getStatusLabel(snapshot.state);
  const titleLabel = getTitle(snapshot);
  const overallPercent = snapshot.percent ?? 0;
  const stagePercent = snapshot.stagePercent ?? 0;
  const activeState = isActiveState(snapshot.state);
  const terminalState = isTerminalState(snapshot.state) || snapshot.state === "Missing";
  const text = formatMessage(snapshot.error ?? snapshot.message ?? snapshot.failureMessage ?? "Waiting for preview status.");

  document.title = titleLabel;
  pageTitle.textContent = titleLabel;
  message.textContent = text;
  message.hidden = terminalState;
  message.classList.toggle("error", terminalState && snapshot.state !== "Cancelled");
  progressSection.hidden = !activeState;
  terminalSection.hidden = !terminalState;
  statusValue.textContent = statusLabel;
  overallSummary.textContent = activeState ? `${overallPercent}%` : statusLabel;
  previewPath.textContent = snapshot.previewPath ?? refreshTarget;
  updatedAt.textContent = snapshot.updatedAtUtc ? formatUpdated(snapshot.updatedAtUtc) : "Waiting";
  hint.textContent = getHint(snapshot);

  overallProgressValue.textContent = `${overallPercent}%`;
  stageProgressLabel.textContent = snapshot.stage ? `${snapshot.stage} progress` : "Stage progress";
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

  cancelButton.hidden = !canCancel && !cancelInFlight;
  cancelButton.disabled = !canCancel || cancelInFlight;
  cancelButton.textContent = cancelInFlight ? "Cancelling..." : "Cancel prep";

  retryButton.hidden = !canRetry && !retryInFlight;
  retryButton.disabled = !canRetry || retryInFlight;
  if (retryButtonLabel) {
    retryButtonLabel.textContent = retryInFlight ? "Restarting..." : "Retry prep";
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
    updatedAtUtc: payload.updatedAtUtc ?? new Date().toISOString(),
    previewPath: payload.previewPath ?? refreshTarget,
    repositoryOwner: payload.repositoryOwner ?? null,
    repositoryName: payload.repositoryName ?? null,
    isReady: false,
  };
}

function closeEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
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

  return `Preparing PR #${number}`;
}

function getHint(snapshot) {
  if (snapshot.state === "Missing") {
    return "Retry after CI publishes a new artifact.";
  }

  if (snapshot.state === "Failed") {
    return "Fix the backing configuration or publish a new build, then retry.";
  }

  if (snapshot.state === "Cancelled") {
    return "Retry when you are ready to start again.";
  }

  if (snapshot.state === "Evicted") {
    return "Retry to prepare it again.";
  }

  return "This page will open the preview automatically as soon as preparation finishes.";
}

function getStateClassName(state) {
  return String(state ?? "missing").toLowerCase();
}

function formatMessage(text) {
  return String(text).replace(/\d{4,}/g, (value) => numberFormatter.format(Number(value)));
}

function formatUpdated(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : timeFormatter.format(date).replace(",", " -");
}
