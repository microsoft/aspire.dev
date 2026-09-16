// Tests the pure logic of live-status.ts that does not require DOM/SSE.
// (Full SSE + DOM coverage is in the Playwright e2e spec.)

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
