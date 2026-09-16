import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  dismissCookieConsentIfVisible,
  waitForAccessibilityEnhancements,
} from '@tests/e2e/helpers';

type Theme = 'light' | 'dark';

async function prepareLivePage(page: Page, theme: Theme, live: boolean): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((selectedTheme: Theme) => {
    localStorage.setItem('starlight-theme', selectedTheme);
    localStorage.removeItem('starlight-synced-tabs__stream-source');

    // Keep status fixed at the JSON seed instead of depending on a real SSE
    // service or a stream happening to be live when the audit runs.
    class MockEventSource {
      onopen: (() => void) | null = null;
      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
      addEventListener(): void {}
      close(): void {}
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
          throw new Error('Native PiP is not opened by the accessibility audit.');
        },
      },
    });
    Object.defineProperty(window, 'WcpConsent', {
      configurable: true,
      value: {
        init(
          _culture: string,
          _host: HTMLElement,
          callback: (error: null, consent: unknown) => void
        ) {
          callback(null, {
            isConsentRequired: false,
            getConsent: () => ({ Required: true, Analytics: false }),
            applyTheme() {},
          });
        },
      },
    });
  }, theme);
  await page.route(
    /wcpstatic\.microsoft\.com|js\.monitor\.azure\.com|\/scripts\/analytics\//,
    (route) => route.abort()
  );
  await page.route(/\/api\/live\/?$/, (route) =>
    route.fulfill({
      json: {
        isLive: live,
        primarySource: live ? 'twitch' : null,
        twitch: { live, channel: live ? 'aspiredotdev' : null },
        youtube: { live, videoId: live ? 'test-live-video' : null },
        liveSessionId: live ? 'accessibility-test-session' : null,
        updatedAt: new Date(0).toISOString(),
      },
    })
  );
  // Audit first-party controls and iframe names, not third-party player
  // interiors. Blank documents also prevent provider errors/ads/network timing
  // from changing the page under the audit.
  await page.route(
    /https:\/\/(?:www\.youtube-nocookie\.com\/embed\/|player\.twitch\.tv\/)/,
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en"><head><title>Player test frame</title></head><body></body></html>',
      })
  );
  await page.goto('/community/videos/');
  await dismissCookieConsentIfVisible(page);
  await waitForAccessibilityEnhancements(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('#aspire-live-tabs')).toHaveAttribute('data-bound', '1');
  // The videos page intentionally suppresses the header's live strobe/source.
  // Read the player state rather than treating that suppression as an idle feed.
  await expect(page.locator('#aspire-live-tabs')).toHaveAttribute(
    'data-active-source',
    live ? 'twitch' : 'none'
  );
}

async function expectAccessible(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .options({ iframes: false, rules: { 'color-contrast': { enabled: true } } })
    .analyze();
  const violations = results.violations.map(({ id, impact, help, nodes }) => ({
    id,
    impact,
    help,
    nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  }));
  expect(violations, `${state}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const live of [false, true]) {
    test(`videos ${live ? 'live' : 'idle'} provider tabs pass WCAG AA in ${theme}`, async ({
      page,
    }) => {
      await prepareLivePage(page, theme, live);

      for (const provider of ['YouTube', 'Twitch'] as const) {
        const tab = page.getByRole('tab', { name: provider, exact: true });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        const panel = page.getByRole('tabpanel', { name: provider, exact: true });
        await expect(panel).toBeVisible();
        await expect(panel.locator('iframe')).toHaveAttribute(
          'aria-label',
          `Aspire on ${provider}`
        );
        await expect(panel.locator('.live-embed-wrapper')).toHaveAttribute(
          'data-live',
          String(live)
        );
        await expectAccessible(page, `${theme}, ${live ? 'live' : 'idle'}, ${provider}`);
      }

      const twitch = page.getByRole('tab', { name: 'Twitch', exact: true });
      await twitch.focus();
      await page.keyboard.press('ArrowLeft');
      const youtube = page.getByRole('tab', { name: 'YouTube', exact: true });
      await expect(youtube).toBeFocused();
      await expect(youtube).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowRight');
      await expect(twitch).toBeFocused();
      await expect(twitch).toHaveAttribute('aria-selected', 'true');
    });
  }

  test(`open live picker passes WCAG AA and keyboard navigation in ${theme}`, async ({ page }) => {
    await prepareLivePage(page, theme, true);
    const touchFirst = await page.evaluate(
      () => window.matchMedia('(hover: none) and (pointer: coarse)').matches
    );
    const trigger = page.locator('.live-btn:visible').first();
    await trigger.click();
    const picker = page.getByRole('dialog', { name: 'Choose how to watch' });
    await expect(picker).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const youtubePip = picker.getByRole('button', { name: /Open YouTube Picture-in-Picture/ });
    const twitchLink = picker.getByRole('link', { name: /Watch on Twitch/ });
    await expect(touchFirst ? twitchLink : youtubePip).toBeFocused();
    if (touchFirst) {
      await expect(youtubePip).toBeHidden();
    } else {
      await expect(youtubePip).toBeVisible();
    }
    await expectAccessible(page, `${theme}, ${touchFirst ? 'touch' : 'desktop'} picker open`);

    // The picker is nonmodal. Preserve native Tab order (including the close
    // control), rather than imposing a focus trap on the rest of the page.
    await (touchFirst ? twitchLink : youtubePip).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(picker.getByRole('button', { name: 'Close watch options' })).toBeFocused();
    const tabOrder = [
      ...(!touchFirst
        ? [youtubePip, picker.getByRole('button', { name: /Open Twitch Picture-in-Picture/ })]
        : []),
      twitchLink,
      picker.getByRole('link', { name: /Watch on YouTube/ }),
      picker.getByRole('link', { name: /Open embedded players/ }),
      picker.getByRole('button', { name: 'Dismiss notification' }),
    ];
    for (const control of tabOrder) {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await picker.getByRole('button', { name: 'Close watch options' }).click();
    await expect(picker).toBeHidden();
    await expect(trigger).toBeFocused();
    const search = page.getByRole('button', { name: 'Search', exact: true });
    await search.focus();
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();

    await trigger.click();
    await picker.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(picker).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('data-live-dismissed', 'true');
  });
}
