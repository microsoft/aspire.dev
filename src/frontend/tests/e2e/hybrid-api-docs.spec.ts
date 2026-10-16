import { expect, test } from '@playwright/test';

test('built StaticHost navigation keeps API styles, search and Markdown actions usable', async ({ page, context }) => {
  const missingAssets: string[] = [];
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(page.url()).origin) {
      missingAssets.push(`${response.status()} ${response.url()}`);
    }
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page).not.toHaveTitle('Aspire Static Host');
  await page.goto('/docs/');
  await expect(page.locator('meta[name="git-commit-id"]')).toHaveCount(1);
  await page.goto('/reference/api/typescript/');
  await expect(page.locator('[data-api-search-language="typescript"]')).toBeVisible();
  const indexUrl = await page.locator('[data-api-search-language="typescript"]').getAttribute('data-api-search-index-url');
  expect(indexUrl).toBe('/reference/api-search/typescript.json');
  await expect(page.locator('[data-api-search-index]')).toHaveCount(0);
  const index = await (await page.request.get(indexUrl!)).json();
  expect(Array.isArray(index) && index.length).toBeGreaterThan(0);
  const markdownRequest = page.waitForResponse(response =>
    response.url().endsWith('/reference/api/typescript.md') && response.ok());
  await page.locator('[data-page-action="copy-markdown"]:visible').first().click();
  expect(await (await markdownRequest).text()).toContain('# TypeScript API Reference');
  const link = page.locator('#ts-api-package-list a').first();
  await page.evaluate(() => {
    document.documentElement.dataset.hybridNavigation = 'pending';
    document.addEventListener('astro:page-load', () => {
      document.documentElement.dataset.hybridNavigation = 'ready';
    }, { once: true });
  });
  await link.click();
  await expect(page.locator('html')).toHaveAttribute('data-hybrid-navigation', 'ready');
  await expect(page.locator('[data-api-search-kind="module"]')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  const footerLogo = page.locator('.footer-wordmark img');
  await footerLogo.scrollIntoViewIfNeeded();
  await expect.poll(() => footerLogo.evaluate(image => image instanceof HTMLImageElement
    && image.complete && image.naturalWidth > 0)).toBe(true);
  await page.goto('/reference/api/csharp/');
  await expect(page.locator('[data-api-search-language="csharp"]')).toBeVisible();
  await page.goto('/docs/');
  await expect(page.locator('h1')).toBeVisible();
  expect(missingAssets).toEqual([]);
});
