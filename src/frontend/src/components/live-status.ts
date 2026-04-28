/**
 * Live status client. Singleton; idempotent across Astro view transitions.
 *
 * Wires the header `.live-btn` icon and dispatches a typed
 * `aspire:live-change` CustomEvent on `document` whenever the snapshot
 * actually changes. Reconnects on errors with exponential backoff and
 * forces a reconnect when the tab becomes visible again.
 */

export interface LiveSnapshot {
  isLive: boolean;
  primarySource: 'twitch' | 'youtube' | null;
  twitch: { live: boolean; channel: string | null };
  youtube: { live: boolean; videoId: string | null };
  updatedAt: string;
}

declare global {
  interface DocumentEventMap {
    'aspire:live-change': CustomEvent<LiveSnapshot>;
  }
}

const EMPTY: LiveSnapshot = {
  isLive: false,
  primarySource: null,
  twitch: { live: false, channel: null },
  youtube: { live: false, videoId: null },
  updatedAt: new Date(0).toISOString(),
};

const BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 30_000];

let started = false;
let current: LiveSnapshot = EMPTY;
let source: EventSource | null = null;
let backoffIndex = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(s: LiveSnapshot) => void>();

function snapshotsEqual(a: LiveSnapshot, b: LiveSnapshot): boolean {
  return (
    a.isLive === b.isLive &&
    a.primarySource === b.primarySource &&
    a.twitch.live === b.twitch.live &&
    a.twitch.channel === b.twitch.channel &&
    a.youtube.live === b.youtube.live &&
    a.youtube.videoId === b.youtube.videoId
  );
}

function applySnapshot(next: LiveSnapshot, force = false): void {
  if (!force && snapshotsEqual(current, next)) {
    current = next;
    return;
  }
  current = next;
  syncDom();
  for (const fn of listeners) {
    try {
      fn(current);
    } catch (err) {
      console.error('[live-status] listener threw', err);
    }
  }
  document.dispatchEvent(
    new CustomEvent<LiveSnapshot>('aspire:live-change', { detail: current }),
  );
}

function syncDom(): void {
  const buttons = document.querySelectorAll<HTMLElement>('.live-btn');
  const shouldStrobe = current.isLive && !isVideosPage();
  const sourceAttr = shouldStrobe
    ? current.twitch.live && current.youtube.live
      ? 'both'
      : (current.primarySource ?? 'none')
    : 'none';
  buttons.forEach((btn) => {
    btn.dataset.live = shouldStrobe ? 'true' : 'false';
    btn.dataset.source = sourceAttr;
    btn.setAttribute(
      'aria-label',
      current.isLive ? 'Aspire is live — watch now' : 'Watch Aspire videos',
    );
  });
}

function isVideosPage(): boolean {
  return window.location.pathname.replace(/\/+$/, '/') === '/community/videos/';
}

async function seed(): Promise<void> {
  try {
    const res = await fetch('/api/live', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const json = (await res.json()) as LiveSnapshot;
      applySnapshot(json, true);
    }
  } catch {
    /* fine — SSE will catch up */
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
  backoffIndex = Math.min(backoffIndex + 1, BACKOFF_MS.length - 1);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  closeSource();
  try {
    source = new EventSource('/api/live/stream');
  } catch (err) {
    console.warn('[live-status] EventSource unavailable', err);
    scheduleReconnect();
    return;
  }

  source.onopen = () => {
    backoffIndex = 0;
  };

  source.addEventListener('state', (evt) => {
    try {
      const data = JSON.parse((evt as MessageEvent<string>).data) as LiveSnapshot;
      applySnapshot(data);
    } catch (err) {
      console.warn('[live-status] failed to parse state event', err);
    }
  });

  source.addEventListener('meta', (evt) => {
    try {
      const data = JSON.parse((evt as MessageEvent<string>).data) as LiveSnapshot;
      // meta updates do not retrigger animations: only update buffered state.
      current = data;
    } catch {
      /* ignore */
    }
  });

  source.onerror = () => {
    closeSource();
    scheduleReconnect();
  };
}

function closeSource(): void {
  if (source) {
    try {
      source.close();
    } catch {
      /* ignore */
    }
    source = null;
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible' && !source) {
    backoffIndex = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    connect();
  }
}

export function getCurrent(): LiveSnapshot {
  return current;
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
  document.addEventListener('visibilitychange', onVisibilityChange);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  document.addEventListener('astro:after-swap', init);
}
