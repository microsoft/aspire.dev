import { expect, test, type Page } from '@playwright/test';
import type { LiveSnapshot } from '@components/live-status';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

const uploadsId = 'UUW_UJkc7RhM_NPcDXnOCfrQ';
const youtubeSelector = '#aspire-live-tabs iframe[data-stream-provider="youtube"]';
const twitchSelector = '#aspire-live-tabs iframe[data-stream-provider="twitch"]';
const idle: LiveSnapshot = {
  isLive: false,
  primarySource: null,
  twitch: { live: false, channel: null },
  youtube: { live: false, videoId: null },
  updatedAt: new Date(0).toISOString(),
};

declare global {
  interface Window {
    __emitLiveEmbedState?: (snapshot: LiveSnapshot) => void;
    __youtubeEmbedWrites?: number;
    __liveEmbedNavigationMarker?: boolean;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('starlight-synced-tabs__stream-source');
    class MockEventSource {
      onopen: (() => void) | null = null;
      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
      addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        if (type === 'state') {
          window.__emitLiveEmbedState = (snapshot) =>
            listener(new MessageEvent('state', { data: JSON.stringify(snapshot) }));
        }
      }
      close() {}
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: MockEventSource });
    window.__youtubeEmbedWrites = 0;
    const src = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      ...src,
      set(value: string) {
        if (this.matches('#aspire-live-tabs iframe[data-stream-provider="youtube"]')) {
          window.__youtubeEmbedWrites = (window.__youtubeEmbedWrites ?? 0) + 1;
        }
        src.set!.call(this, value);
      },
    });
  });
  await page.route(/\/api\/live\/?$/, (route) => route.fulfill({ json: idle }));
  await page.route(/^https:\/\/(?:player\.twitch\.tv|www\.youtube-nocookie\.com)\//, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><title>Test player</title></html>',
    })
  );
});

async function emit(page: Page, snapshot: LiveSnapshot): Promise<void> {
  await page.evaluate((state) => {
    if (!window.__emitLiveEmbedState) throw new Error('Live status client has not connected.');
    window.__emitLiveEmbedState(state);
  }, snapshot);
}

async function expectYouTube(page: Page, videoId: string | null, autoplay: boolean): Promise<void> {
  await expect
    .poll(async () => {
      const src = await page.locator(youtubeSelector).getAttribute('src');
      if (!src) return null;
      const url = new URL(src);
      return {
        path: url.pathname,
        playlist: url.searchParams.get('list'),
        channel: url.searchParams.get('channel'),
        autoplay: url.searchParams.get('autoplay'),
        mute: url.searchParams.get('mute'),
      };
    })
    .toEqual({
      path: videoId ? `/embed/${videoId}` : '/embed/videoseries',
      playlist: videoId ? null : uploadsId,
      channel: null,
      autoplay: autoplay ? '1' : '0',
      mute: autoplay ? '1' : '0',
    });
}

test('uploads transition to the exact live video and back without redundant reloads', async ({
  page,
}) => {
  await page.goto('/community/videos/');
  await dismissCookieConsentIfVisible(page);
  await expect(page.locator('#aspire-live-tabs')).toHaveAttribute('data-bound', '1');
  await expectYouTube(page, null, false);
  expect(await page.evaluate(() => window.__youtubeEmbedWrites)).toBe(0);

  const live: LiveSnapshot = {
    ...idle,
    isLive: true,
    primarySource: 'youtube',
    youtube: { live: true, videoId: 'first-live-video' },
    updatedAt: new Date().toISOString(),
  };
  await emit(page, live);
  await expectYouTube(page, 'first-live-video', true);
  const writes = await page.evaluate(() => window.__youtubeEmbedWrites);
  await emit(page, { ...live, twitch: { live: true, channel: 'aspiredotdev' } });
  await expectYouTube(page, 'first-live-video', true);
  expect(await page.evaluate(() => window.__youtubeEmbedWrites)).toBe(writes);

  await emit(page, { ...live, youtube: { live: true, videoId: 'second-live-video' } });
  await expectYouTube(page, 'second-live-video', true);
  await emit(page, { ...live, youtube: { live: true, videoId: null } });
  await expect(page.locator(youtubeSelector)).toHaveAttribute(
    'src',
    /\/embed\/live_stream\?.*channel=UCW_UJkc7RhM_NPcDXnOCfrQ/
  );
  await emit(page, idle);
  await expectYouTube(page, null, false);
});

test('hidden YouTube switches sources without autoplay and stays offline when selected', async ({
  page,
}) => {
  await page.goto('/community/videos/');
  await dismissCookieConsentIfVisible(page);
  await expect(page.locator('#aspire-live-tabs')).toHaveAttribute('data-bound', '1');
  await page.getByRole('tab', { name: 'Twitch', exact: true }).click();
  const live: LiveSnapshot = {
    ...idle,
    isLive: true,
    primarySource: 'youtube',
    youtube: { live: true, videoId: 'hidden-live-video' },
  };
  await emit(page, live);
  await expectYouTube(page, 'hidden-live-video', false);
  await expect(page.getByRole('tab', { name: 'Twitch', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  await emit(page, idle);
  await expectYouTube(page, null, false);
  await page.getByRole('tab', { name: 'YouTube', exact: true }).click();
  await expectYouTube(page, null, false);
});

test('Twitch uses the current hostname on its first request and after client navigation', async ({
  page,
}) => {
  const requestedParents: string[][] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'player.twitch.tv') {
      requestedParents.push(url.searchParams.getAll('parent'));
    }
  });
  await page.goto('/community/videos/');
  await dismissCookieConsentIfVisible(page);
  const hostname = new URL(page.url()).hostname;
  await page.getByRole('tab', { name: 'Twitch', exact: true }).click();
  await expect.poll(() => requestedParents.length).toBeGreaterThan(0);
  await expect
    .poll(async () =>
      new URL((await page.locator(twitchSelector).getAttribute('src'))!).searchParams.getAll(
        'parent'
      )
    )
    .toEqual([hostname]);

  await page.evaluate(() => {
    window.__liveEmbedNavigationMarker = true;
  });
  await page.locator('.header .site-title').click();
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  await page.locator('.live-btn:visible').first().click();
  await expect(page).toHaveURL(/\/community\/videos\/$/);
  await expect(page.locator('#aspire-live-tabs')).toHaveAttribute('data-bound', '1');
  await page.getByRole('tab', { name: 'Twitch', exact: true }).click();
  await expect.poll(() => requestedParents.length).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.__liveEmbedNavigationMarker)).toBe(true);
  expect(requestedParents.every((parents) => parents.length === 1 && parents[0] === hostname)).toBe(
    true
  );
  await expectYouTube(page, null, false);
});
