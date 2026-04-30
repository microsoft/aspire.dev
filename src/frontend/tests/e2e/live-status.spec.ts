import { expect, test, type Page } from '@playwright/test';

import { dismissCookieConsentIfVisible, isNarrowViewport } from '@tests/e2e/helpers';

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
    liveSessionId?: string | null;
    updatedAt: string;
  };

  const idleSnapshot: LiveSnapshot = {
    isLive: false,
    primarySource: null,
    twitch: { live: false, channel: null },
    youtube: { live: false, videoId: null },
    liveSessionId: null,
    updatedAt: new Date(0).toISOString(),
  };

  function visibleLiveButton(page: Page) {
    return page.locator('.live-btn:visible').first();
  }

  test('live action dialog stays within the mobile viewport when live', async ({ page }) => {
    test.skip(!isNarrowViewport(page), 'This regression only applies to narrow/mobile viewports.');

    const liveSnapshot: LiveSnapshot = {
      isLive: true,
      primarySource: 'twitch',
      twitch: { live: true, channel: 'aspiredotdev' },
      youtube: { live: true, videoId: 'abc123' },
      updatedAt: new Date().toISOString(),
    };

    await page.addInitScript(() => {
      class MockEventSource {
        onopen: (() => void) | null = null;

        constructor() {
          setTimeout(() => this.onopen?.(), 0);
        }

        addEventListener(): void {
          /* no-op: this layout test is seeded by the mocked JSON endpoint. */
        }

        close(): void {
          /* no-op */
        }
      }

      Object.defineProperty(window, 'EventSource', {
        configurable: true,
        value: MockEventSource,
      });
      Object.defineProperty(window, 'documentPictureInPicture', {
        configurable: true,
        value: {
          window: null,
          async requestWindow() {
            throw new Error('Picture-in-Picture should not be opened in this layout test.');
          },
        },
      });
    });

    await page.route('**/api/live', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(liveSnapshot),
      })
    );

    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = visibleLiveButton(page);
    await expect(liveBtn).toHaveAttribute('data-source', 'both');
    await liveBtn.click();

    const liveDialog = page.getByRole('dialog', { name: 'Watch Aspire live' });
    await expect(liveDialog).toBeVisible();
    await expect(liveDialog.getByText('Choose how to watch')).toBeVisible();
    await expect(liveDialog.getByRole('button', { name: /Open YouTube Picture-in-Picture/ }))
      .toBeVisible();
    await expect(liveDialog.getByRole('button', { name: /Open Twitch Picture-in-Picture/ }))
      .toBeVisible();
    await expect(liveDialog.getByRole('button', { name: 'Dismiss notification' })).toBeInViewport();
    await expect(liveDialog.getByRole('button', { name: 'Dismiss live notification' }))
      .toBeVisible();

    const box = await liveDialog.boundingBox();
    const headerBox = await page.getByRole('banner').boundingBox();
    const viewport = page.viewportSize();
    if (!box || !headerBox || !viewport) {
      throw new Error('Unable to measure the live dialog, header, and viewport.');
    }

    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(viewport.width);
    expect(Math.abs(box.y - (headerBox.y + headerBox.height))).toBeLessThanOrEqual(1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    await liveBtn.click();
    await expect(liveDialog).toBeHidden();

    await liveBtn.click();
    await expect(liveDialog).toBeVisible();
    const reopenedBox = await liveDialog.boundingBox();
    if (!reopenedBox) {
      throw new Error('Unable to measure the reopened live dialog.');
    }

    expect(Math.round(reopenedBox.x)).toBe(0);
    expect(Math.round(reopenedBox.width)).toBe(viewport.width);
    expect(Math.abs(reopenedBox.y - box.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(reopenedBox.height - box.height)).toBeLessThanOrEqual(1);
    await expect(liveDialog.getByRole('button', { name: 'Dismiss notification' })).toBeInViewport();

    await liveDialog.getByRole('button', { name: 'Dismiss live notification' }).click();
    await expect(liveDialog).toBeHidden();
    await expect(liveBtn).toHaveAttribute('data-live-dismissed', 'true');
  });

  test('live action dialog toggles and keeps desktop labels on one line', async ({ page }) => {
    test.skip(isNarrowViewport(page), 'Desktop layout is covered by the desktop project.');

    const liveSnapshot: LiveSnapshot = {
      isLive: true,
      primarySource: 'twitch',
      twitch: { live: true, channel: 'aspiredotdev' },
      youtube: { live: true, videoId: 'abc123' },
      updatedAt: new Date().toISOString(),
    };

    await page.addInitScript(() => {
      class MockEventSource {
        onopen: (() => void) | null = null;

        constructor() {
          setTimeout(() => this.onopen?.(), 0);
        }

        addEventListener(): void {
          /* no-op: this layout test is seeded by the mocked JSON endpoint. */
        }

        close(): void {
          /* no-op */
        }
      }

      Object.defineProperty(window, 'EventSource', {
        configurable: true,
        value: MockEventSource,
      });
      Object.defineProperty(window, 'documentPictureInPicture', {
        configurable: true,
        value: {
          window: null,
          async requestWindow() {
            throw new Error('Picture-in-Picture should not be opened in this layout test.');
          },
        },
      });
    });

    await page.route('**/api/live', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(liveSnapshot),
      })
    );

    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = visibleLiveButton(page);
    await expect(liveBtn).toHaveAttribute('data-source', 'both');
    await liveBtn.click();

    const liveDialog = page.getByRole('dialog', { name: 'Watch Aspire live' });
    await expect(liveDialog).toBeVisible();

    const firstBox = await liveDialog.boundingBox();
    const viewport = page.viewportSize();
    if (!firstBox || !viewport) {
      throw new Error('Unable to measure the live dialog and viewport.');
    }

    expect(firstBox.x).toBeGreaterThanOrEqual(0);
    expect(firstBox.y).toBeGreaterThanOrEqual(0);
    expect(firstBox.x + firstBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(firstBox.y + firstBox.height).toBeLessThanOrEqual(viewport.height + 1);

    await expect(liveDialog.getByText('Open YouTube Picture-in-Picture')).toBeVisible();
    await expect
      .poll(() =>
        liveDialog.getByText('Open YouTube Picture-in-Picture').evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const lineCount = range.getClientRects().length;
          range.detach();
          return lineCount;
        })
      )
      .toBe(1);

    await liveBtn.click();
    await expect(liveDialog).toBeHidden();

    await liveBtn.click();
    await expect(liveDialog).toBeVisible();
    const reopenedBox = await liveDialog.boundingBox();
    if (!reopenedBox) {
      throw new Error('Unable to measure the reopened live dialog.');
    }

    expect(Math.abs(reopenedBox.x - firstBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(reopenedBox.y - firstBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(reopenedBox.width - firstBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(reopenedBox.height - firstBox.height)).toBeLessThanOrEqual(1);
  });

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

    const liveBtn = visibleLiveButton(page);
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
      (
        window as Window & { __aspireLiveSseEmit?: (s: LiveSnapshot) => void }
      ).__aspireLiveSseEmit?.(snapshot);
    }, liveSnapshot);

    await expect(liveBtn).toHaveAttribute('data-live', 'true', { timeout: 10_000 });
    await expect(liveBtn).toHaveAttribute('data-source', 'twitch');
    await expect(liveBtn).toHaveAttribute('aria-label', /live/i);

    await liveBtn.click();
    const liveDialog = page.getByRole('dialog', { name: 'Watch Aspire live' });
    await expect(liveDialog).toBeVisible();
    await liveDialog.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(liveBtn).toHaveAttribute('data-live', 'false');
    await expect(liveBtn).toHaveAttribute('data-live-dismissed', 'true');
  });

  test('dismissed live session stays dismissed when a second provider joins', async ({ page }) => {
    await page.addInitScript(() => {
      type StateListener = (evt: MessageEvent<string>) => void;
      const listeners = new Set<StateListener>();

      class MockEventSource {
        onopen: (() => void) | null = null;

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

    await page.route('**/api/live', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(idleSnapshot),
      })
    );

    await page.goto('/');
    await dismissCookieConsentIfVisible(page);

    const liveBtn = visibleLiveButton(page);
    await expect(liveBtn).toHaveAttribute('data-live', 'false');

    const firstProviderLive: LiveSnapshot = {
      isLive: true,
      primarySource: 'twitch',
      twitch: { live: true, channel: 'aspiredotdev' },
      youtube: { live: false, videoId: null },
      liveSessionId: 'live-session-1',
      updatedAt: new Date().toISOString(),
    };
    await page.evaluate((snapshot) => {
      (
        window as Window & { __aspireLiveSseEmit?: (s: LiveSnapshot) => void }
      ).__aspireLiveSseEmit?.(snapshot);
    }, firstProviderLive);

    await expect(liveBtn).toHaveAttribute('data-live', 'true');
    await liveBtn.click();
    await page
      .getByRole('dialog', { name: 'Watch Aspire live' })
      .getByRole('button', { name: 'Dismiss notification' })
      .click();
    await expect(liveBtn).toHaveAttribute('data-live-dismissed', 'true');

    const secondProviderJoined: LiveSnapshot = {
      ...firstProviderLive,
      youtube: { live: true, videoId: 'abc123' },
      updatedAt: new Date(Date.now() + 30_000).toISOString(),
    };
    await page.evaluate((snapshot) => {
      (
        window as Window & { __aspireLiveSseEmit?: (s: LiveSnapshot) => void }
      ).__aspireLiveSseEmit?.(snapshot);
    }, secondProviderJoined);

    await expect(liveBtn).toHaveAttribute('data-live', 'false');
    await expect(liveBtn).toHaveAttribute('data-live-dismissed', 'true');

    await page.evaluate((snapshot) => {
      (
        window as Window & { __aspireLiveSseEmit?: (s: LiveSnapshot) => void }
      ).__aspireLiveSseEmit?.(snapshot);
    }, idleSnapshot);
    await expect(liveBtn).toHaveAttribute('data-live-dismissed', 'false');

    await page.evaluate((snapshot) => {
      (
        window as Window & { __aspireLiveSseEmit?: (s: LiveSnapshot) => void }
      ).__aspireLiveSseEmit?.(snapshot);
    }, { ...firstProviderLive, liveSessionId: 'live-session-2' });
    await expect(liveBtn).toHaveAttribute('data-live', 'true');
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
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(liveSnapshot),
      })
    );

    await page.route('**/api/live/stream', async (route) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(`event: state\ndata: ${JSON.stringify(liveSnapshot)}\n\n`)
          );
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

    const liveBtn = visibleLiveButton(page);
    await expect(liveBtn).toHaveAttribute('data-live', 'false');
    await expect(liveBtn).toHaveAttribute('aria-label', /live/i);
  });

  test('live header dialog opens site-global native picture-in-picture and suppresses strobe', async ({
    page,
  }) => {
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
              ((window as Window & { __aspirePipRequested?: number }).__aspirePipRequested ?? 0) +
              1;
            this.window = fakePipWindow;
            return fakePipWindow;
          },
        },
      });
    });

    await page.route('**/api/live', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(liveSnapshot),
      })
    );

    await page.route('**/api/live/stream', async (route) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(`event: state\ndata: ${JSON.stringify(liveSnapshot)}\n\n`)
          );
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

    const liveBtn = visibleLiveButton(page);
    await expect(liveBtn).toHaveAttribute('data-live', 'true');
    await liveBtn.click();

    const liveDialog = page.getByRole('dialog', { name: 'Watch Aspire live' });
    await expect(liveDialog).toBeVisible();
    await expect(liveDialog.getByRole('link', { name: /Open live streams page/ })).toHaveAttribute(
      'href',
      /\/community\/videos\/$/
    );
    await expect(liveDialog.getByRole('link', { name: /Watch on Twitch/ })).toHaveAttribute(
      'href',
      'https://www.twitch.tv/aspiredotdev'
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested
        )
      )
      .toBe(0);

    await liveDialog.getByRole('button', { name: /Open Twitch Picture-in-Picture/ }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested
        )
      )
      .toBe(1);
    await expect(liveBtn).toHaveAttribute('data-live', 'false');
    await expect(liveBtn).toHaveAttribute('data-pip-open', 'true');
    expect(new URL(page.url()).pathname).not.toBe('/community/videos/');

    const iframeSrcBeforeNavigation = await page.evaluate(() => {
      const pipState = (
        window as Window & {
          __aspireLivePipState?: { pipWindow?: { document?: Document } };
        }
      ).__aspireLivePipState;
      return pipState?.pipWindow?.document?.querySelector('iframe')?.getAttribute('src') ?? null;
    });

    await page.locator('a.docs-btn:visible, a.docs-btn-mobile:visible').first().click();
    await expect(page).toHaveURL(/\/docs\/$/);

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested
        )
      )
      .toBe(1);
    const liveBtnAfterNavigation = visibleLiveButton(page);
    await expect(liveBtnAfterNavigation).toHaveAttribute('data-live', 'false');
    await expect(liveBtnAfterNavigation).toHaveAttribute('data-pip-open', 'true');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pipState = (
            window as Window & {
              __aspireLivePipState?: { pipWindow?: { document?: Document } };
            }
          ).__aspireLivePipState;
          return (
            pipState?.pipWindow?.document?.querySelector('iframe')?.getAttribute('src') ?? null
          );
        })
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
              ((window as Window & { __aspirePipRequested?: number }).__aspirePipRequested ?? 0) +
              1;
            this.window = fakePipWindow;
            return fakePipWindow;
          },
        },
      });
    });

    await page.route('**/api/live', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(liveSnapshot),
      })
    );

    await page.route('**/api/live/stream', async (route) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(`event: state\ndata: ${JSON.stringify(liveSnapshot)}\n\n`)
          );
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

    const liveBtn = visibleLiveButton(page);
    await expect(liveBtn).toHaveAttribute('data-source', 'both');
    await liveBtn.click();

    const sourceMenu = page.getByRole('dialog', { name: 'Watch Aspire live' });
    await expect(sourceMenu).toBeVisible();
    await expect(sourceMenu.getByText('Embedded players')).toBeVisible();
    await expect(sourceMenu.locator('.live-source-menu__external-icon')).toHaveCount(2);
    await expect(sourceMenu.getByRole('button', { name: 'Dismiss live notification' }))
      .toBeVisible();
    await expect(sourceMenu.getByText('aspiredotdev')).toHaveCount(0);
    await expect(sourceMenu.getByRole('link', { name: /Open live streams page/ })).toHaveAttribute(
      'href',
      /\/community\/videos\/$/
    );
    await expect(sourceMenu.getByRole('link', { name: /Watch on YouTube/ })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abc123'
    );
    await expect(sourceMenu.getByRole('link', { name: /Watch on Twitch/ })).toHaveAttribute(
      'href',
      'https://www.twitch.tv/aspiredotdev'
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested
        )
      )
      .toBe(0);

    await sourceMenu.getByRole('button', { name: /Open YouTube Picture-in-Picture/ }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested
        )
      )
      .toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pipState = (
            window as Window & {
              __aspireLivePipState?: { pipWindow?: { document?: Document } };
            }
          ).__aspireLivePipState;
          return (
            pipState?.pipWindow?.document?.querySelector('iframe')?.getAttribute('src') ?? null
          );
        })
      )
      .toContain('youtube-nocookie.com/embed/abc123');

    await liveBtn.click();
    await expect(sourceMenu).toBeVisible();
    await sourceMenu.getByRole('button', { name: /Open Twitch Picture-in-Picture/ }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __aspirePipRequested?: number }).__aspirePipRequested
        )
      )
      .toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pipState = (
            window as Window & {
              __aspireLivePipState?: { pipWindow?: { document?: Document } };
            }
          ).__aspireLivePipState;
          return (
            pipState?.pipWindow?.document?.querySelector('iframe')?.getAttribute('src') ?? null
          );
        })
      )
      .toContain('player.twitch.tv/?channel=aspiredotdev');
  });

  test('videos page loads channel embeds while idle', async ({ page }) => {
    await page.route('**/api/live', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(idleSnapshot),
      })
    );

    await page.route('**/api/live/stream', async (route) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(`event: state\ndata: ${JSON.stringify(idleSnapshot)}\n\n`)
          );
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
    await expect(youtubeFrame).toHaveAttribute(
      'src',
      /\/embed\/live_stream\?.*channel=UC8Hyt2P1u3KKnBgRf-Iv6_Q/
    );
    await expect(twitchFrame).toHaveAttribute('src', /player\.twitch\.tv\/\?channel=aspiredotdev/);
    await expect(youtubeFrame).not.toHaveAttribute('title');
    await expect(twitchFrame).not.toHaveAttribute('title');
    await expect(youtubeFrame).toHaveAttribute('aria-label', 'Aspire on YouTube');
    await expect(twitchFrame).toHaveAttribute('aria-label', 'Aspire on Twitch');
  });
});
