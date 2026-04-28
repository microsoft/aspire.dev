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
    await page.addInitScript(() => {
      type StateListener = (evt: MessageEvent<string>) => void;
      const listeners = new Set<StateListener>();

      class MockEventSource {
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;

        constructor() {
          setTimeout(() => this.onopen?.(), 0);
        }

        addEventListener(type: string, listener: StateListener): void {
          if (type === 'state') listeners.add(listener);
        }

        close(): void {
          listeners.clear();
        }
      }

      Object.defineProperty(window, 'EventSource', {
        configurable: true,
        value: MockEventSource,
      });
      Object.defineProperty(window, '__aspireLiveSseEmit', {
        configurable: true,
        value(snapshot: LiveSnapshot) {
          const evt = new MessageEvent('state', { data: JSON.stringify(snapshot) });
          listeners.forEach((listener) => listener(evt));
        },
      });
    });

    await page.route('**/api/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(idleSnapshot),
      });
    });

    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = page.locator('.live-btn').first();
    await expect(liveBtn).toBeVisible();
    await expect(liveBtn).toHaveAttribute('data-live', 'false');

    const liveSnapshot: LiveSnapshot = {
      isLive: true,
      primarySource: 'twitch',
      twitch: { live: true, channel: 'aspiredotdev' },
      youtube: { live: false, videoId: null },
      updatedAt: new Date().toISOString(),
    };
    await page.evaluate((snapshot) => {
      (window as Window & { __aspireLiveSseEmit?: (s: LiveSnapshot) => void }).__aspireLiveSseEmit?.(snapshot);
    }, liveSnapshot);

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

  test('live header click opens site-global native picture-in-picture and suppresses strobe', async ({ page }) => {
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
        focus() {
          /* no-op */
        },
        close() {
          this.closed = true;
        },
        addEventListener() {
          /* no-op */
        },
      };
      Object.defineProperty(window, '__aspirePipRequested', {
        configurable: true,
        value: 0,
        writable: true,
      });
      Object.defineProperty(window, 'documentPictureInPicture', {
        configurable: true,
        value: {
          window: null,
          async requestWindow() {
            (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested =
              ((window as Window & { __aspirePipRequested?: number }).__aspirePipRequested ?? 0) + 1;
            this.window = fakePipWindow;
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

    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = page.locator('.live-btn').first();
    await expect(liveBtn).toHaveAttribute('data-live', 'true');
    await liveBtn.click();

    await expect
      .poll(() => page.evaluate(() => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested))
      .toBe(1);
    await expect(liveBtn).toHaveAttribute('data-live', 'false');
    await expect(liveBtn).toHaveAttribute('data-pip-open', 'true');
    expect(new URL(page.url()).pathname).not.toBe('/community/videos/');

    const iframeSrcBeforeNavigation = await page.evaluate(() => {
      const pipState = (window as Window & {
        __aspireLivePipState?: { pipWindow?: { document?: Document } };
      }).__aspireLivePipState;
      return pipState?.pipWindow?.document?.querySelector('iframe')?.getAttribute('src') ?? null;
    });

    await page.locator('a.docs-btn').click();
    await expect(page).toHaveURL(/\/docs\/$/);

    await expect
      .poll(() => page.evaluate(() => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested))
      .toBe(1);
    const liveBtnAfterNavigation = page.locator('.live-btn').first();
    await expect(liveBtnAfterNavigation).toHaveAttribute('data-live', 'false');
    await expect(liveBtnAfterNavigation).toHaveAttribute('data-pip-open', 'true');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pipState = (window as Window & {
            __aspireLivePipState?: { pipWindow?: { document?: Document } };
          }).__aspireLivePipState;
          return pipState?.pipWindow?.document?.querySelector('iframe')?.getAttribute('src') ?? null;
        }),
      )
      .toBe(iframeSrcBeforeNavigation);
  });

  test('live header offers a provider choice when both streams are live', async ({ page }) => {
    const liveSnapshot: LiveSnapshot = {
      isLive: true,
      primarySource: 'twitch',
      twitch: { live: true, channel: 'aspiredotdev' },
      youtube: { live: true, videoId: 'abc123' },
      updatedAt: new Date().toISOString(),
    };

    await page.addInitScript(() => {
      const pipDocument = document.implementation.createHTMLDocument('Aspire live stream');
      const fakePipWindow = {
        document: pipDocument,
        closed: false,
        focus() {
          /* no-op */
        },
        close() {
          this.closed = true;
        },
        addEventListener() {
          /* no-op */
        },
      };
      Object.defineProperty(window, '__aspirePipRequested', {
        configurable: true,
        value: 0,
        writable: true,
      });
      Object.defineProperty(window, 'documentPictureInPicture', {
        configurable: true,
        value: {
          window: null,
          async requestWindow() {
            (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested =
              ((window as Window & { __aspirePipRequested?: number }).__aspirePipRequested ?? 0) + 1;
            this.window = fakePipWindow;
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

    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = page.locator('.live-btn').first();
    await expect(liveBtn).toHaveAttribute('data-source', 'both');
    await liveBtn.click();

    const sourceMenu = page.getByRole('menu', { name: 'Choose live stream' });
    await expect(sourceMenu).toBeVisible();
    await expect(sourceMenu.locator('svg')).toHaveCount(2);
    await expect(sourceMenu.getByText('aspiredotdev')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested))
      .toBe(0);

    await sourceMenu.getByRole('menuitem', { name: /YouTube/ }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested))
      .toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pipState = (window as Window & {
            __aspireLivePipState?: { pipWindow?: { document?: Document } };
          }).__aspireLivePipState;
          return pipState?.pipWindow?.document?.querySelector('iframe')?.getAttribute('src') ?? null;
        }),
      )
      .toContain('youtube-nocookie.com/embed/abc123');

    await liveBtn.click();
    await expect(sourceMenu).toBeVisible();
    await sourceMenu.getByRole('menuitem', { name: /Twitch/ }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested))
      .toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pipState = (window as Window & {
            __aspireLivePipState?: { pipWindow?: { document?: Document } };
          }).__aspireLivePipState;
          return pipState?.pipWindow?.document?.querySelector('iframe')?.getAttribute('src') ?? null;
        }),
      )
      .toContain('player.twitch.tv/?channel=aspiredotdev');
  });

  test('videos page loads channel embeds while idle', async ({ page }) => {
    await page.route('**/api/live', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(idleSnapshot) }),
    );

    await page.route('**/api/live/stream', async (route) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`event: state\ndata: ${JSON.stringify(idleSnapshot)}\n\n`));
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

    const youtubeFrame = page.locator('.live-embed-wrapper[data-source="youtube"] iframe');
    const twitchFrame = page.locator('.live-embed-wrapper[data-source="twitch"] iframe');
    await expect(youtubeFrame).toHaveAttribute('src', /\/embed\/live_stream\?.*channel=UC8Hyt2P1u3KKnBgRf-Iv6_Q/);
    await expect(twitchFrame).toHaveAttribute('src', /player\.twitch\.tv\/\?channel=aspiredotdev/);
    await expect(youtubeFrame).not.toHaveAttribute('title');
    await expect(twitchFrame).not.toHaveAttribute('title');
    await expect(youtubeFrame).toHaveAttribute('aria-label', 'Aspire on YouTube');
    await expect(twitchFrame).toHaveAttribute('aria-label', 'Aspire on Twitch');
  });
});
