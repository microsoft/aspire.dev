import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible, isNarrowViewport } from '@tests/e2e/helpers';

test('AppHost API search keeps result names visible on narrow viewports', async ({ page }) => {
  test.skip(!isNarrowViewport(page), 'This regression only applies to narrow/mobile viewports.');

  await page.goto('/reference/api/apphost/?q=withBun&aspire-lang=typescript');
  await dismissCookieConsentIfVisible(page);

  const results = page.locator('#apphost-api-search-results .api-search-result');
  await expect(results.first()).toBeVisible();

  const firstResult = results.first();
  const resultName = firstResult.locator('.api-search-result-name');
  const resultKind = firstResult.locator('.api-kind-micro');
  const resultPackage = firstResult.locator('.trailing .api-list-meta');

  await expect(firstResult).toBeVisible();
  await expect(resultName).toHaveText('withBun');
  await expect(resultName).toBeVisible();
  await expect(resultKind).toContainText(/method/i);
  await expect(resultKind).toBeVisible();
  await expect(resultPackage).toContainText('Aspire.Hosting.JavaScript');
  await expect(resultPackage).toBeVisible();

  await expect
    .poll(async () => {
      const box = await resultName.boundingBox();
      return Math.round(box?.width ?? 0);
    })
    .toBeGreaterThan(20);
});