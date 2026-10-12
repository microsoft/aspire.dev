import { expect, test, type Request } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

// Native Document PiP needs the full browser rather than headless shell.
test.use({ channel: 'chromium' });

for (const videoId of ['DtdP0JBawPI', null]) {
  test(`native YouTube PiP sends a referrer for the ${videoId ? 'video' : 'channel fallback'}`, async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(isMobile, 'Native Document Picture-in-Picture requires a desktop browser.');

    const snapshot = {
      isLive: true,
      primarySource: 'twitch',
      twitch: { live: true, channel: 'aspiredotdev' },
      youtube: { live: true, videoId },
      updatedAt: new Date().toISOString(),
    };
    await page.route(/\/api\/live\/?$/, (route) => route.fulfill({ json: snapshot }));
    await page.route(/\/api\/live\/stream\/?$/, (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: `event: state\ndata: ${JSON.stringify(snapshot)}\n\n`,
      })
    );

    // Stub only the provider response, not PiP: Chromium must generate the real request.
    const embeds: Request[] = [];
    await context.route(
      /^https:\/\/(?:www\.youtube-nocookie\.com\/embed\/|player\.twitch\.tv\/)/,
      async (route) => {
        embeds.push(route.request());
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Provider player</title><p>Provider player</p>',
        });
      }
    );

    await page.goto('/');
    await dismissCookieConsentIfVisible(page);
    expect(await page.evaluate(() => 'documentPictureInPicture' in window)).toBe(true);
    const expectedReferrer = new URL(page.url()).origin + '/';
    const liveButton = () => page.locator('.live-btn:visible').first();
    const menu = page.getByRole('dialog', { name: 'Choose how to watch' });
    const youtube = menu.getByRole('button', { name: /Open YouTube Picture-in-Picture/ });
    const twitch = menu.getByRole('button', { name: /Open Twitch Picture-in-Picture/ });

    await expect(liveButton()).toHaveAttribute('data-source', 'both');
    await liveButton().click();
    const opened = context.waitForEvent('page');
    await youtube.click();
    const pip = await opened;

    await expect.poll(() => embeds.length).toBe(1);
    expect(await embeds[0].headerValue('referer')).toBe(expectedReferrer);
    const embedUrl = new URL(embeds[0].url());
    expect(embedUrl.origin).toBe('https://www.youtube-nocookie.com');
    expect(embedUrl.pathname).toBe(`/embed/${videoId ?? 'live_stream'}`);
    if (!videoId) {
      expect(embedUrl.searchParams.get('channel')).toBe('UCW_UJkc7RhM_NPcDXnOCfrQ');
    }
    expect(embedUrl.searchParams.get('autoplay')).toBe('1');
    expect(embedUrl.searchParams.get('mute')).toBe('1');
    await expect(liveButton()).toHaveAttribute('data-pip-open', 'true');

    await page.locator('header a[href="/docs/"]:visible').click();
    await expect(page).toHaveURL(/\/docs\/$/);
    await expect(liveButton()).toHaveAttribute('data-pip-open', 'true');
    expect(pip.isClosed()).toBe(false);
    await liveButton().click();
    await youtube.click();
    expect(embeds).toHaveLength(1);

    await liveButton().click();
    await twitch.click();
    await expect.poll(() => embeds.length).toBe(2);
    const twitchUrl = new URL(embeds[1].url());
    expect(twitchUrl.origin).toBe('https://player.twitch.tv');
    expect(twitchUrl.searchParams.get('parent')).toBe(new URL(page.url()).hostname);

    await liveButton().click();
    await youtube.click();
    await expect.poll(() => embeds.length).toBe(3);
    expect(embeds[2].url()).toBe(embeds[0].url());
    expect(await embeds[2].headerValue('referer')).toBe(expectedReferrer);

    await pip.close();
    await expect(liveButton()).toHaveAttribute('data-pip-open', 'false');
    await expect(liveButton()).toHaveAttribute('data-live', 'true');
    await expect(page).toHaveURL(/\/docs\/$/);

    await liveButton().click();
    const reopened = context.waitForEvent('page');
    await youtube.click();
    const nextPip = await reopened;
    await expect.poll(() => embeds.length).toBe(4);
    expect(await embeds[3].headerValue('referer')).toBe(expectedReferrer);
    await nextPip.close();
    await expect(liveButton()).toHaveAttribute('data-pip-open', 'false');
  });
}
