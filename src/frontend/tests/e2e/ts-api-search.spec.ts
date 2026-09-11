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

test('AppHost API corrects unsupported stored languages after listeners initialize', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('aspire-lang', 'csharp');
    localStorage.setItem('starlight-synced-tabs__aspire-lang', 'C#');
  });

  await page.goto('/reference/api/apphost/?aspire-lang=csharp');
  await dismissCookieConsentIfVisible(page);

  await expect(page.locator('html')).toHaveAttribute('data-apphost-lang', 'typescript');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('aspire-lang'))
    .toBe('typescript');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
    .toBe('typescript');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
    .toBe('TypeScript');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-apphost-lang', 'typescript');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('aspire-lang'))
    .toBe('typescript');

  await page.goto('/reference/api/apphost/aspire.hosting/');
  await expect(page.locator('html')).toHaveAttribute('data-apphost-lang', 'typescript');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('aspire-lang')))
    .toBe('typescript');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('starlight-synced-tabs__aspire-lang')))
    .toBe('TypeScript');
});
