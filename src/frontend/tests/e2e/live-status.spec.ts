import { expect, test } from '@playwright/test';

import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

/**
 * E2E coverage for the live-status feature.
 *
 * The frontend always points at `/api/live` (JSON seed) and
 * `/api/live/stream` (SSE). In the e2e environment there is no StaticHost
 * backend, so we mock both — the JSON for the initial seed and a long-lived
 * streaming response for SSE. The streaming body is split into chunks the
 * test can flush at will, so we can assert the icon transitions deterministic-
 * ally.
 */
test.describe('live status', () => {
  type LiveSnapshot = {
    isLive: boolean;
    primarySource: 'twitch' | 'youtube' | null;
    twitch: { live: boolean; channel: string | null };
    youtube: { live: boolean; videoId: string | null };
    updatedAt: string;
  };

  const idleSnapshot: LiveSnapshot = {
    isLive: false,
    primarySource: null,
    twitch: { live: false, channel: null },
    youtube: { live: false, videoId: null },
    updatedAt: new Date(0).toISOString(),
  };

  test('header icon strobes when an SSE state event flips to live', async ({ page }) => {
    let resolveLive!: () => void;
    const liveGate = new Promise<void>((res) => (resolveLive = res));

    await page.route('**/api/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(idleSnapshot),
      });
    });

    await page.route('**/api/live/stream', async (route) => {
      const chunks: string[] = [
        `event: state\ndata: ${JSON.stringify(idleSnapshot)}\n\n`,
      ];
      const liveSnapshot: LiveSnapshot = {
        isLive: true,
        primarySource: 'twitch',
        twitch: { live: true, channel: 'aspiredotdev' },
        youtube: { live: false, videoId: null },
        updatedAt: new Date().toISOString(),
      };
      chunks.push(`event: state\ndata: ${JSON.stringify(liveSnapshot)}\n\n`);

      // Stream the idle event immediately, then hold until the test asks
      // us to flush the live event.
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(chunks[0]!));
          await liveGate;
          controller.enqueue(new TextEncoder().encode(chunks[1]!));
          // Keep the stream open — close would trigger client reconnect.
        },
      });

      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        },
        body: body as unknown as Buffer,
      });
    });

    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = page.locator('.live-btn').first();
    await expect(liveBtn).toBeVisible();
    await expect(liveBtn).toHaveAttribute('data-live', 'false');

    resolveLive();

    await expect(liveBtn).toHaveAttribute('data-live', 'true', { timeout: 10_000 });
    await expect(liveBtn).toHaveAttribute('data-source', 'twitch');
    await expect(liveBtn).toHaveAttribute('aria-label', /live/i);
  });

  test('header icon does not strobe on the videos page', async ({ page }) => {
    const liveSnapshot: LiveSnapshot = {
      isLive: true,
      primarySource: 'twitch',
      twitch: { live: true, channel: 'aspiredotdev' },
      youtube: { live: false, videoId: null },
      updatedAt: new Date().toISOString(),
    };

    await page.route('**/api/live', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveSnapshot) }),
    );

    await page.route('**/api/live/stream', async (route) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`event: state\ndata: ${JSON.stringify(liveSnapshot)}\n\n`));
        },
      });
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        },
        body: body as unknown as Buffer,
      });
    });

    await page.goto('/community/videos/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = page.locator('.live-btn').first();
    await expect(liveBtn).toHaveAttribute('data-live', 'false');
    await expect(liveBtn).toHaveAttribute('aria-label', /live/i);
  });

  test('live header click opens native picture-in-picture instead of redirecting', async ({ page }) => {
    const liveSnapshot: LiveSnapshot = {
      isLive: true,
      primarySource: 'twitch',
      twitch: { live: true, channel: 'aspiredotdev' },
      youtube: { live: false, videoId: null },
      updatedAt: new Date().toISOString(),
    };

    await page.addInitScript(() => {
      const pipDocument = document.implementation.createHTMLDocument('Aspire live stream');
      const fakePipWindow = {
        document: pipDocument,
        closed: false,
        close() {
          this.closed = true;
        },
        addEventListener() {
          /* no-op */
        },
      };
      Object.defineProperty(window, '__aspirePipRequested', {
        configurable: true,
        value: false,
        writable: true,
      });
      Object.defineProperty(window, 'documentPictureInPicture', {
        configurable: true,
        value: {
          async requestWindow() {
            (window as Window & { __aspirePipRequested?: boolean }).__aspirePipRequested = true;
            return fakePipWindow;
          },
        },
      });
    });

    await page.route('**/api/live', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveSnapshot) }),
    );

    await page.route('**/api/live/stream', async (route) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`event: state\ndata: ${JSON.stringify(liveSnapshot)}\n\n`));
        },
      });
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        },
        body: body as unknown as Buffer,
      });
    });

    await page.goto('/get-started/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = page.locator('.live-btn').first();
    await expect(liveBtn).toHaveAttribute('data-live', 'true');
    await liveBtn.click();

    await expect
      .poll(() => page.evaluate(() => (window as Window & { __aspirePipRequested?: boolean }).__aspirePipRequested))
      .toBe(true);
    expect(new URL(page.url()).pathname).not.toBe('/community/videos/');
  });
});
