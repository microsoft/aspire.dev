// Tests live-status.ts with lightweight DOM/SSE mocks.
// Full browser coverage is in the Playwright e2e spec.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrent, subscribe, type LiveSnapshot } from '../../src/components/live-status.ts';

describe('live-status module', () => {
  it('exposes an empty snapshot before any SSE traffic arrives', () => {
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

    it('ignores a duplicate seed and title-only metadata, but delivers changed video IDs', async () => {
      vi.resetModules();
      const document = Object.assign(new EventTarget(), {
        readyState: 'complete',
        querySelectorAll: () => [],
      });
      const sources: EventTarget[] = [];
      vi.stubGlobal('document', document);
      vi.stubGlobal('window', { location: { pathname: '/docs/' } });
      vi.stubGlobal(
        'EventSource',
        class extends EventTarget {
          constructor() {
            super();
            sources.push(this);
          }
          close() {}
        }
      );
      const seed = Promise.withResolvers<Response>();
      vi.stubGlobal(
        'fetch',
        vi.fn(() => seed.promise)
      );
      const live = await import('../../src/components/live-status.ts');
      const received: LiveSnapshot[] = [];
      const unsubscribe = live.subscribe((snapshot) => received.push(snapshot));
      const snapshot: LiveSnapshot = {
        isLive: true,
        primarySource: 'youtube',
        twitch: { live: false, channel: null },
        youtube: { live: true, videoId: 'first-video' },
        liveSessionId: 'session-1',
        updatedAt: '2026-09-08T12:00:00Z',
      };
      expect(sources).toHaveLength(1);
      sources[0].dispatchEvent(new MessageEvent('state', { data: JSON.stringify(snapshot) }));
      const newerSeed = { ...snapshot, updatedAt: '2026-09-08T12:00:01Z' };
      seed.resolve(Response.json(newerSeed));
      await vi.waitFor(() => expect(live.getCurrent().updatedAt).toBe(newerSeed.updatedAt));
      expect(received).toHaveLength(2);

      sources[0].dispatchEvent(
        new MessageEvent('meta', {
          data: JSON.stringify({
            ...newerSeed,
            twitch: { ...snapshot.twitch, title: 'New title' },
          }),
        })
      );
      expect(received).toHaveLength(2);

      sources[0].dispatchEvent(
        new MessageEvent('meta', {
          data: JSON.stringify({ ...newerSeed, youtube: { live: true, videoId: 'second-video' } }),
        })
      );
      expect(received).toHaveLength(3);
      expect(received[2].youtube.videoId).toBe('second-video');
      unsubscribe();
    });
  });

  describe('live-status reconnects', () => {
    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    async function setup() {
      vi.resetModules();
      vi.useFakeTimers();
      const document = Object.assign(new EventTarget(), {
        readyState: 'complete',
        visibilityState: 'visible',
        querySelectorAll: () => [],
      });
      const sources: MockEventSource[] = [];
      class MockEventSource extends EventTarget {
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        close = vi.fn();

        constructor() {
          super();
          sources.push(this);
        }
      }
      const seed = Promise.withResolvers<Response>();
      const fetch = vi.fn(() => seed.promise);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('document', document);
      vi.stubGlobal('window', { location: { pathname: '/docs/' } });
      vi.stubGlobal('EventSource', MockEventSource);
      vi.stubGlobal('fetch', fetch);
      const live = await import('../../src/components/live-status.ts');
      return { document, sources, seed, fetch, warn, live };
    }

    it.each([false, true])('stops after a 404 with a pending reconnect: %s', async (pending) => {
      const { document, sources, seed, fetch, warn, live } = await setup();
      expect(sources).toHaveLength(1);
      if (pending) sources[0].onerror?.();
      expect(vi.getTimerCount()).toBe(pending ? 1 : 0);

      seed.resolve(new Response(null, { status: 404 }));
      await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
      expect(warn).toHaveBeenCalledWith(
        '[live-status] Live API not found (404); live updates disabled until reload.'
      );
      expect(sources[0].close).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);

      sources[0].onerror?.();
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('astro:after-swap'));
      live.init();
      await vi.advanceTimersByTimeAsync(300_000);
      expect(sources).toHaveLength(1);
      expect(fetch).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([500, 503, 'network'])('preserves reconnect backoff after a %s failure', async (failure) => {
      const { sources, seed, warn } = await setup();
      if (typeof failure === 'number') {
        seed.resolve(new Response(null, { status: failure }));
      } else {
        seed.reject(new TypeError('Failed to fetch'));
      }
      await vi.advanceTimersByTimeAsync(0);
      sources[0].onerror?.();
      await vi.advanceTimersByTimeAsync(999);
      expect(sources).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sources).toHaveLength(2);
      sources[1].onerror?.();
      await vi.advanceTimersByTimeAsync(1_999);
      expect(sources).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(sources).toHaveLength(3);
      sources[2].onopen?.();
      sources[2].onerror?.();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sources).toHaveLength(4);
      expect(warn).not.toHaveBeenCalled();
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
