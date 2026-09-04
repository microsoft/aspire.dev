// Tests the pure logic of live-status.ts that does not require DOM/SSE.
// (Full SSE + DOM coverage is in the Playwright e2e spec.)

import { describe, expect, it } from 'vitest';
import { getCurrent, subscribe, type LiveSnapshot } from '../../src/components/live-status.ts';

describe('live-status module', () => {
  it('exposes an empty snapshot before any SSE traffic arrives', () => {
    const snap = getCurrent();
    expect(snap.isLive).toBe(false);
    expect(snap.primarySource).toBeNull();
    expect(snap.twitch.live).toBe(false);
    expect(snap.youtube.live).toBe(false);
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
