/**
 * Live status client. Singleton; idempotent across Astro view transitions.
 *
 * Wires the header `.live-btn` icon and dispatches a typed
 * `aspire:live-change` CustomEvent on `document` whenever the snapshot
 * actually changes. State arrives over a WebSocket (`/api/live/ws`); Azure Front
 * Door does not relay Server-Sent Events, so SSE is not used. The socket
 * reconnects with jittered exponential backoff, is released after a tab stays
 * hidden, and reconnects when the tab becomes visible or the browser comes back
 * online. Whenever the socket is not open the JSON snapshot (`/api/live/`) is
 * polled, so the icon cannot go stale if WebSockets are blocked. A missing
 * snapshot endpoint disables live updates until a full page reload.
 */

export interface LiveSnapshot {
  isLive: boolean;
  primarySource: 'twitch' | 'youtube' | null;
  twitch: { live: boolean; channel: string | null };
  youtube: { live: boolean; videoId: string | null };
  liveSessionId?: string | null;
  updatedAt: string;
}

declare global {
  interface DocumentEventMap {
    'aspire:live-change': CustomEvent<LiveSnapshot>;
    'aspire:live-pip-change': CustomEvent<{ open: boolean }>;
  }
  interface Window {
    __aspireLiveNotificationDismissedKey?: string;
  }
}

const EMPTY: LiveSnapshot = {
  isLive: false,
  primarySource: null,
  twitch: { live: false, channel: null },
  youtube: { live: false, videoId: null },
  liveSessionId: null,
  updatedAt: new Date(0).toISOString(),
};

const BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 30_000];
// Hidden tabs release their socket after this grace period; visibility reconnects.
const HIDDEN_CLOSE_DELAY_MS = 60_000;
// While the socket is not open, re-fetch the JSON snapshot this often.
const POLL_INTERVAL_MS = 30_000;
// The server sends a heartbeat every 15 s; three missed beats means a dead socket.
const STALE_SOCKET_MS = 45_000;

let started = false;
let unavailable = false;
let current: LiveSnapshot = EMPTY;
let socket: WebSocket | null = null;
let socketOpen = false;
let backoffIndex = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenCloseTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let staleTimer: ReturnType<typeof setTimeout> | null = null;
let pipOpen = false;
const listeners = new Set<(s: LiveSnapshot) => void>();

type LiveMessage = { type: 'state'; data: LiveSnapshot } | { type: 'hb' };

function snapshotsEqual(a: LiveSnapshot, b: LiveSnapshot): boolean {
  return (
    a.isLive === b.isLive &&
    a.primarySource === b.primarySource &&
    a.twitch.live === b.twitch.live &&
    a.twitch.channel === b.twitch.channel &&
    a.youtube.live === b.youtube.live &&
    a.youtube.videoId === b.youtube.videoId &&
    (a.liveSessionId ?? null) === (b.liveSessionId ?? null)
  );
}

function applySnapshot(next: LiveSnapshot): void {
  if (snapshotsEqual(current, next)) {
    current = next;
    return;
  }
  current = next;
  if (!current.isLive) {
    clearLiveNotificationDismissal();
  }
  syncDom();
  for (const fn of listeners) {
    try {
      fn(current);
    } catch (err) {
      console.error('[live-status] listener threw', err);
    }
  }
  document.dispatchEvent(new CustomEvent<LiveSnapshot>('aspire:live-change', { detail: current }));
}

function syncDom(): void {
  pipOpen = isLivePipOpen();
  const buttons = document.querySelectorAll<HTMLElement>('.live-btn');
  const notificationDismissed = isLiveNotificationDismissed(current);
  const shouldStrobe = current.isLive && !isVideosPage() && !pipOpen && !notificationDismissed;
  const sourceAttr = shouldStrobe
    ? current.twitch.live && current.youtube.live
      ? 'both'
      : (current.primarySource ?? 'none')
    : 'none';
  buttons.forEach((btn) => {
    btn.dataset.live = shouldStrobe ? 'true' : 'false';
    btn.dataset.pipOpen = pipOpen ? 'true' : 'false';
    btn.dataset.liveDismissed = notificationDismissed ? 'true' : 'false';
    btn.dataset.source = sourceAttr;
    btn.setAttribute(
      'aria-label',
      current.isLive ? 'Aspire is live — watch now' : 'Watch Aspire live streams'
    );
  });
}

function isVideosPage(): boolean {
  return window.location.pathname.replace(/\/+$/, '/') === '/community/videos/';
}

function isLivePipOpen(): boolean {
  return Boolean(
    (window as Window & { __aspireLivePipState?: { open?: boolean } }).__aspireLivePipState?.open
  );
}

function onLivePipChange(evt: CustomEvent<{ open: boolean }>): void {
  pipOpen = evt.detail.open;
  syncDom();
}

async function seed(): Promise<void> {
  try {
    const res = await fetch('/api/live/', { headers: { Accept: 'application/json' } });
    if (res.status === 404) {
      unavailable = true;
      closeSocket();
      clearReconnectTimer();
      clearPollTimer();
      console.warn('[live-status] Live API not found (404); live updates disabled until reload.');
      return;
    }
    if (res.ok) {
      const json = (await res.json()) as LiveSnapshot;
      // A `state` message can arrive while this request is in flight. Only apply
      // the seed if it isn't older than what we've already rendered, so a slow
      // snapshot response can't clobber fresher live state pushed over the socket.
      if (Date.parse(json.updatedAt) >= Date.parse(current.updatedAt)) {
        applySnapshot(json);
      }
    }
  } catch {
    /* fine — the socket or the poller will catch up */
  }
}

function clearPollTimer(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

// Fallback while the socket is not open (blocked by a proxy, reconnecting, ...).
function schedulePoll(): void {
  if (unavailable || pollTimer || socketOpen) return;
  pollTimer = setTimeout(() => {
    pollTimer = null;
    if (unavailable || socketOpen || document.visibilityState === 'hidden') return;
    void seed().finally(schedulePoll);
  }, POLL_INTERVAL_MS);
}

function clearStaleTimer(): void {
  if (staleTimer) {
    clearTimeout(staleTimer);
    staleTimer = null;
  }
}

// Any message, including heartbeats, proves the socket is alive.
function armStaleTimer(): void {
  clearStaleTimer();
  staleTimer = setTimeout(() => {
    staleTimer = null;
    handleSocketLost();
    if (document.visibilityState !== 'hidden') void seed();
  }, STALE_SOCKET_MS);
}

function handleSocketLost(): void {
  closeSocket();
  scheduleReconnect();
  schedulePoll();
}

function liveSocketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/api/live/ws`;
}

function onSocketMessage(evt: MessageEvent): void {
  armStaleTimer();
  let message: LiveMessage;
  try {
    message = JSON.parse(evt.data as string) as LiveMessage;
  } catch (err) {
    console.warn('[live-status] failed to parse live message', err);
    return;
  }
  if (message.type === 'state') applySnapshot(message.data);
}

function scheduleReconnect(): void {
  if (unavailable || reconnectTimer) return;
  // Randomize between 50% and 150% so tabs dropped together don't reconnect together.
  const delay = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)] * (0.5 + Math.random());
  backoffIndex = Math.min(backoffIndex + 1, BACKOFF_MS.length - 1);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  if (unavailable) return;
  closeSocket();
  let ws: WebSocket;
  try {
    ws = new WebSocket(liveSocketUrl());
  } catch (err) {
    console.warn('[live-status] WebSocket unavailable', err);
    scheduleReconnect();
    schedulePoll();
    return;
  }
  socket = ws;
  // Until the socket opens, the snapshot poller covers for it.
  schedulePoll();

  ws.onopen = () => {
    if (socket !== ws) return;
    socketOpen = true;
    backoffIndex = 0;
    clearPollTimer();
    armStaleTimer();
  };
  ws.onmessage = (evt) => {
    if (socket === ws) onSocketMessage(evt);
  };
  // `error` is always followed by `close`, so reconnect handling lives in one place.
  ws.onclose = () => {
    if (socket === ws) handleSocketLost();
  };
}

// Detach handlers first so an intentional close never triggers a reconnect.
function closeSocket(): void {
  clearStaleTimer();
  socketOpen = false;
  if (socket) {
    const ws = socket;
    socket = null;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearHiddenCloseTimer(): void {
  if (hiddenCloseTimer) {
    clearTimeout(hiddenCloseTimer);
    hiddenCloseTimer = null;
  }
}

function scheduleHiddenClose(): void {
  if (hiddenCloseTimer) return;
  hiddenCloseTimer = setTimeout(() => {
    hiddenCloseTimer = null;
    if (document.visibilityState !== 'hidden') return;
    clearReconnectTimer();
    clearPollTimer();
    closeSocket();
  }, HIDDEN_CLOSE_DELAY_MS);
}

function reconnectNow(): void {
  if (unavailable) return;
  backoffIndex = 0;
  clearReconnectTimer();
  connect();
  // A fresh snapshot immediately covers whatever was missed while disconnected.
  void seed();
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    scheduleHiddenClose();
    return;
  }
  clearHiddenCloseTimer();
  if (document.visibilityState === 'visible' && !socket) reconnectNow();
  else schedulePoll();
}

function onOnline(): void {
  if (document.visibilityState !== 'hidden' && !socketOpen) reconnectNow();
}

export function getCurrent(): LiveSnapshot {
  return current;
}

function liveNotificationKey(snapshot: LiveSnapshot): string {
  if (!snapshot.isLive) return '';
  if (snapshot.liveSessionId) return `session:${snapshot.liveSessionId}`;
  if (snapshot.primarySource === 'twitch' && snapshot.twitch.live) {
    return `twitch:${snapshot.twitch.channel ?? 'live'}`;
  }
  if (snapshot.primarySource === 'youtube' && snapshot.youtube.live) {
    return `youtube:${snapshot.youtube.videoId ?? 'live'}`;
  }
  if (snapshot.twitch.live) return `twitch:${snapshot.twitch.channel ?? 'live'}`;
  if (snapshot.youtube.live) return `youtube:${snapshot.youtube.videoId ?? 'live'}`;
  return '';
}

function clearLiveNotificationDismissal(): void {
  delete window.__aspireLiveNotificationDismissedKey;
}

export function isLiveNotificationDismissed(snapshot = current): boolean {
  const key = liveNotificationKey(snapshot);
  return key.length > 0 && window.__aspireLiveNotificationDismissedKey === key;
}

export function dismissLiveNotification(snapshot = current): void {
  const key = liveNotificationKey(snapshot);
  if (!key) return;
  window.__aspireLiveNotificationDismissedKey = key;
  syncDom();
}

export function subscribe(listener: (s: LiveSnapshot) => void): () => void {
  listeners.add(listener);
  // deliver immediately so late subscribers aren't stale
  try {
    listener(current);
  } catch (err) {
    console.error('[live-status] listener threw on subscribe', err);
  }
  return () => listeners.delete(listener);
}

export function init(): void {
  // Always re-sync the DOM so freshly swapped header buttons get the right state.
  syncDom();
  if (started) return;
  started = true;
  void seed();
  connect();
  if (document.visibilityState === 'hidden') scheduleHiddenClose();
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('aspire:live-pip-change', onLivePipChange);
  window.addEventListener('online', onOnline);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  document.addEventListener('astro:after-swap', init);
}
