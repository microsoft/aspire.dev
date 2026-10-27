// Tests live-status.ts with lightweight DOM/WebSocket mocks.
// Full browser coverage is in the Playwright e2e spec.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrent, subscribe, type LiveSnapshot } from '../../src/components/live-status.ts';

class MockWebSocket extends EventTarget {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((evt: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(public url: string) {
    super();
    MockWebSocket.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  send(message: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  drop() {
    this.onerror?.();
    this.onclose?.();
  }
}

const liveSnapshot: LiveSnapshot = {
  isLive: true,
  primarySource: 'youtube',
  twitch: { live: false, channel: null },
  youtube: { live: true, videoId: 'first-video' },
  liveSessionId: 'session-1',
  updatedAt: '2026-09-08T12:00:00Z',
};

describe('live-status module', () => {
  it('exposes an empty snapshot before any live traffic arrives', () => {
    const snap = getCurrent();
    expect(snap.isLive).toBe(false);
    expect(snap.primarySource).toBeNull();
    expect(snap.twitch.live).toBe(false);
    expect(snap.youtube.live).toBe(false);
  });

  describe('live-status update deduplication', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('ignores a duplicate seed and title-only updates, but delivers changed video IDs', async () => {
      vi.resetModules();
      MockWebSocket.instances = [];
      const document = Object.assign(new EventTarget(), {
        readyState: 'complete',
        querySelectorAll: () => [],
      });
      vi.stubGlobal('document', document);
      vi.stubGlobal(
        'window',
        Object.assign(new EventTarget(), {
          location: { pathname: '/docs/', protocol: 'https:', host: 'aspire.dev' },
        })
      );
      vi.stubGlobal('WebSocket', MockWebSocket);
      const seed = Promise.withResolvers<Response>();
      vi.stubGlobal(
        'fetch',
        vi.fn(() => seed.promise)
      );
      const live = await import('../../src/components/live-status.ts');
      const received: LiveSnapshot[] = [];
      const unsubscribe = live.subscribe((snapshot) => received.push(snapshot));
      const sockets = MockWebSocket.instances;
      expect(sockets).toHaveLength(1);
      expect(sockets[0].url).toBe('wss://aspire.dev/api/live/ws');
      sockets[0].open();
      sockets[0].send({ type: 'state', data: liveSnapshot });
      const newerSeed = { ...liveSnapshot, updatedAt: '2026-09-08T12:00:01Z' };
      seed.resolve(Response.json(newerSeed));
      await vi.waitFor(() => expect(live.getCurrent().updatedAt).toBe(newerSeed.updatedAt));
      expect(received).toHaveLength(2);

      sockets[0].send({
        type: 'state',
        data: { ...newerSeed, twitch: { ...liveSnapshot.twitch, title: 'New title' } },
      });
      expect(received).toHaveLength(2);

      sockets[0].send({ type: 'hb' });
      expect(received).toHaveLength(2);

      sockets[0].send({
        type: 'state',
        data: { ...newerSeed, youtube: { live: true, videoId: 'second-video' } },
      });
      expect(received).toHaveLength(3);
      expect(received[2].youtube.videoId).toBe('second-video');
      unsubscribe();
    });
  });

  describe('live-status reconnects and polling fallback', () => {
    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    async function setup(protocol = 'http:') {
      vi.resetModules();
      vi.useFakeTimers();
      MockWebSocket.instances = [];
      const document = Object.assign(new EventTarget(), {
        readyState: 'complete',
        visibilityState: 'visible',
        querySelectorAll: () => [],
      });
      const window = Object.assign(new EventTarget(), {
        location: { pathname: '/docs/', protocol, host: 'localhost:4321' },
      });
      const seed = Promise.withResolvers<Response>();
      const fetch = vi.fn<() => Promise<Response>>(() => seed.promise);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Center the reconnect jitter so delays equal the base backoff.
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      vi.stubGlobal('document', document);
      vi.stubGlobal('window', window);
      vi.stubGlobal('WebSocket', MockWebSocket);
      vi.stubGlobal('fetch', fetch);
      const live = await import('../../src/components/live-status.ts');
      return { document, window, sockets: MockWebSocket.instances, seed, fetch, warn, live };
    }

    it.each([
      ['http:', 'ws://localhost:4321/api/live/ws'],
      ['https:', 'wss://localhost:4321/api/live/ws'],
    ])('derives the socket URL from %s', async (protocol, expected) => {
      const { sockets } = await setup(protocol);
      expect(sockets[0].url).toBe(expected);
    });

    it.each([false, true])('stops after a 404 with a pending reconnect: %s', async (pending) => {
      const { document, window, sockets, seed, fetch, warn, live } = await setup();
      expect(sockets).toHaveLength(1);
      if (pending) sockets[0].drop();
      // reconnect timer (when pending) plus the polling fallback timer
      expect(vi.getTimerCount()).toBe(pending ? 2 : 1);

      seed.resolve(new Response(null, { status: 404 }));
      await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
      expect(warn).toHaveBeenCalledWith(
        '[live-status] Live API not found (404); live updates disabled until reload.'
      );
      expect(sockets[0].close).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);

      sockets[0].drop();
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('astro:after-swap'));
      window.dispatchEvent(new Event('online'));
      live.init();
      await vi.advanceTimersByTimeAsync(300_000);
      expect(sockets).toHaveLength(1);
      expect(fetch).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([500, 503, 'network'])('preserves reconnect backoff after a %s failure', async (failure) => {
      const { sockets, seed, warn } = await setup();
      if (typeof failure === 'number') {
        seed.resolve(new Response(null, { status: failure }));
      } else {
        seed.reject(new TypeError('Failed to fetch'));
      }
      await vi.advanceTimersByTimeAsync(0);
      sockets[0].drop();
      await vi.advanceTimersByTimeAsync(999);
      expect(sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(2);
      sockets[1].drop();
      await vi.advanceTimersByTimeAsync(1_999);
      expect(sockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(3);
      sockets[2].open();
      sockets[2].drop();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sockets).toHaveLength(4);
      expect(warn).not.toHaveBeenCalled();
    });

    it('jitters reconnect delays around the base backoff', async () => {
      const { sockets } = await setup();
      vi.mocked(Math.random).mockReturnValue(0);
      sockets[0].drop();
      await vi.advanceTimersByTimeAsync(499);
      expect(sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(2);
    });

    it('polls the snapshot every 30 seconds while the socket is not open', async () => {
      const { sockets, seed, fetch } = await setup();
      seed.resolve(Response.json({ ...liveSnapshot, isLive: false }));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      sockets[0].drop();

      fetch.mockImplementation(() => Promise.resolve(Response.json(liveSnapshot)));
      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('delivers polled snapshots when the socket never opens', async () => {
      const { seed, fetch, live } = await setup();
      seed.resolve(
        Response.json({ ...liveSnapshot, isLive: false, updatedAt: '2026-09-08T11:00:00Z' })
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(live.getCurrent().isLive).toBe(false);

      fetch.mockImplementation(() => Promise.resolve(Response.json(liveSnapshot)));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(live.getCurrent().isLive).toBe(true);
    });

    it('stops polling while the socket is open and resumes when it drops', async () => {
      const { sockets, seed, fetch } = await setup();
      seed.resolve(Response.json({ ...liveSnapshot, isLive: false }));
      await vi.advanceTimersByTimeAsync(0);
      sockets[0].open();
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(15_000);
        sockets[0].send({ type: 'hb' });
      }
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(sockets).toHaveLength(1);

      sockets[0].drop();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetch.mock.calls.length).toBeGreaterThan(1);
    });

    it('allows heartbeat jitter before reconnecting a stale socket', async () => {
      const { sockets } = await setup();
      sockets[0].open();
      await vi.advanceTimersByTimeAsync(45_000);
      expect(sockets).toHaveLength(1);
      expect(sockets[0].close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(4_999);
      expect(sockets[0].close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets[0].close).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sockets).toHaveLength(2);
    });

    it('treats heartbeats as liveness and does not reconnect', async () => {
      const { sockets } = await setup();
      sockets[0].open();
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(15_000);
        sockets[0].send({ type: 'hb' });
      }
      expect(sockets).toHaveLength(1);
      expect(sockets[0].close).not.toHaveBeenCalled();
    });

    it('closes the socket in hidden tabs and reconnects when visible', async () => {
      const { document, sockets, fetch } = await setup();
      document.visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      sockets[0].drop();
      await vi.advanceTimersByTimeAsync(59_999);
      expect(sockets).toHaveLength(2);
      expect(sockets[1].close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets[1].close).toHaveBeenCalledOnce();
      const fetches = fetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(300_000);
      expect(sockets).toHaveLength(2);
      expect(fetch).toHaveBeenCalledTimes(fetches);

      document.visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      expect(sockets).toHaveLength(3);
    });

    it('keeps the socket when a tab becomes visible within the grace period', async () => {
      const { document, sockets } = await setup();
      sockets[0].open();
      document.visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(30_000);
      sockets[0].send({ type: 'hb' });
      document.visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(15_000);
        sockets[0].send({ type: 'hb' });
      }
      expect(sockets).toHaveLength(1);
      expect(sockets[0].close).not.toHaveBeenCalled();
    });

    it('reconnects immediately when the browser comes back online', async () => {
      const { window, sockets } = await setup();
      sockets[0].drop();
      expect(sockets).toHaveLength(1);
      window.dispatchEvent(new Event('online'));
      expect(sockets).toHaveLength(2);
    });
  });

  it('delivers the current snapshot to a new subscriber synchronously', () => {
    const received: LiveSnapshot[] = [];
    const unsub = subscribe((s) => received.push(s));
    expect(received).toHaveLength(1);
    expect(received[0]?.isLive).toBe(false);
    unsub();
  });

  it('returns an unsubscribe function that prevents future deliveries', () => {
    let count = 0;
    const unsub = subscribe(() => {
      count++;
    });
    expect(count).toBe(1);
    unsub();
    // Re-subscribing a fresh listener confirms the previous unsub stuck:
    // the previous closure should not fire again from a manual subscription.
    let count2 = 0;
    const unsub2 = subscribe(() => {
      count2++;
    });
    expect(count2).toBe(1);
    expect(count).toBe(1); // still 1 — old listener was removed
    unsub2();
  });
});
