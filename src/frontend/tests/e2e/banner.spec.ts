import { expect, test, type Page } from '@playwright/test';

const MS_PER_DAY = 86_400_000;

/**
 * Abort every script request so only inline scripts run. Anything the banner does after that is
 * done by the pre-paint script, not by the bundled controller that normally finishes the job.
 */
async function blockExternalScripts(page: Page): Promise<void> {
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'script' ? route.abort() : route.continue()
  );
}

async function bannerKeys(page: Page) {
  const banner = page.locator('[data-aspire-banner]');
  await expect(banner).toBeVisible();
  const dismissKey = await banner.getAttribute('data-dismiss-key');
  const firstSeenKey = await banner.getAttribute('data-first-seen-key');
  expect(dismissKey).toBeTruthy();
  expect(firstSeenKey).toBeTruthy();
  return { dismissKey: dismissKey as string, firstSeenKey: firstSeenKey as string };
}

test.describe('announcement banner', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalScripts(page);
  });

  test('is in the first paint, so showing it cannot shift the page', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-aspire-banner]')).toBeVisible();
  });

  test('stays hidden for a reader who dismissed it', async ({ page }) => {
    await page.goto('/');
    const { dismissKey } = await bannerKeys(page);

    await page.evaluate((key) => localStorage.setItem(key, 'true'), dismissKey);
    await page.reload();

    await expect(page.locator('[data-aspire-banner]')).toBeHidden();
  });

  test('stays hidden once its auto-dismiss window has elapsed', async ({ page }) => {
    await page.goto('/');
    const { firstSeenKey } = await bannerKeys(page);

    await page.evaluate(
      ([key, firstSeen]) => localStorage.setItem(key, firstSeen),
      [firstSeenKey, String(Date.now() - 30 * MS_PER_DAY)]
    );
    await page.reload();

    await expect(page.locator('[data-aspire-banner]')).toBeHidden();
  });

  test('stays visible inside its auto-dismiss window', async ({ page }) => {
    await page.goto('/');
    const { firstSeenKey } = await bannerKeys(page);

    await page.evaluate(
      ([key, firstSeen]) => localStorage.setItem(key, firstSeen),
      [firstSeenKey, String(Date.now() - 2 * MS_PER_DAY)]
    );
    await page.reload();

    await expect(page.locator('[data-aspire-banner]')).toBeVisible();
  });
});
