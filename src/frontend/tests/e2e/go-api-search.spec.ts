import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible, isNarrowViewport } from '@tests/e2e/helpers';

test('Go API search keeps result names visible on narrow viewports', async ({ page }) => {
  test.skip(!isNarrowViewport(page), 'This regression only applies to narrow/mobile viewports.');

  await page.goto('/reference/api/go/?q=AddRedis');
  await dismissCookieConsentIfVisible(page);

  const results = page.locator('#go-api-search-results .api-search-result');
  await expect(results.first()).toBeVisible();

  const firstResult = results.first();
  const resultName = firstResult.locator('.api-search-result-name');
  const resultKind = firstResult.locator('.api-kind-micro');
  const resultPackage = firstResult.locator('.trailing .api-list-meta');

  await expect(firstResult).toBeVisible();
  await expect(resultName).toHaveText('AddRedis');
  await expect(resultName).toBeVisible();
  await expect(resultKind).toContainText(/method/i);
  await expect(resultKind).toBeVisible();
  await expect(resultPackage).toContainText('Aspire.Hosting.Redis');
  await expect(resultPackage).toBeVisible();

  await expect
    .poll(async () => {
      const box = await resultName.boundingBox();
      return Math.round(box?.width ?? 0);
    })
    .toBeGreaterThan(20);
});

test('Go API search results name the receiver and link to the module-local page', async ({ page }) => {
  await page.goto('/reference/api/go/?q=AddRedis');
  await dismissCookieConsentIfVisible(page);

  const result = page
    .locator('#go-api-search-results .api-search-result', {
      has: page.locator('.api-search-result-name', { hasText: /^AddRedis$/ }),
    })
    .first();

  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('href', '/reference/api/go/aspire.hosting.redis/addredis/');
  await expect(result.locator('.api-result-parent')).toHaveText('DistributedApplicationBuilder');
});
