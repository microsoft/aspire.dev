import { expect, test, type Page } from '@playwright/test';

// The site navigates with full page loads: follow a link the way a reader would, then wait for the new document.
async function navigate(page: Page, href: string) {
  const target = new URL(href, page.url());
  await page.evaluate((destination) => {
    const link = document.createElement('a');
    link.href = destination;
    document.body.append(link);
    link.click();
  }, href);
  await page.waitForURL((url) => url.pathname === target.pathname && url.search === target.search, { timeout: 60_000 });
  await page.waitForLoadState('load');
}

test.describe('hub navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aspireConsentRequired', 'false');
    });
    await page.goto('/hub/');
  });

  test('browse artwork survives entry from a link, paging and returning from another route', async ({ page }) => {
    test.setTimeout(120_000);
    await navigate(page, '/hub/browse/?q=redis');
    const browser = page.locator('resource-browser');
    const images = browser.locator('[data-resource-entry]:not([hidden]) img');
    await expect(browser).toHaveAttribute('data-ready', '');
    expect(await images.count()).toBeGreaterThan(0);
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((html, value) => { html.dataset.theme = value; }, theme);
      const first = images.filter({ visible: true }).first();
      await first.scrollIntoViewIfNeeded();
      await expect.poll(() => first.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    expect(await browser.locator('template[data-resource-image]').count()).toBeGreaterThan(0);
    await navigate(page, '/hub/glossary/');
    await page.goBack();
    await expect(page).toHaveURL(/\/hub\/browse\/\?q=redis$/);
    await expect(browser).toHaveAttribute('data-ready', '');
    await expect(page.locator('#browse-search-input')).toHaveValue('redis');
    expect(await images.count()).toBeGreaterThan(0);
    await page.locator('#browse-search-clear').click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('[data-page-label]')).toHaveText(/Page 2 of/);
    expect(await images.count()).toBeGreaterThan(0);
    await expect(browser.locator('[data-resource-entry]:not([hidden]) template[data-resource-image]')).toHaveCount(0);
  });

  for (const [route, input] of [
    ['/hub/browse/', '#browse-search-input'],
    ['/hub/glossary/', '#glossary-search-input'],
  ]) {
    test(`${route} keeps the typed query in history after leaving`, async ({ page }) => {
      await navigate(page, route);
      await page.locator(input).fill('redis');
      await expect(page).toHaveURL(new RegExp(`${route}\\?q=redis$`));
      await navigate(page, '/hub/');
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${route}\\?q=redis$`));
      await expect(page.locator(input)).toHaveValue('redis');
      await page.goForward();
      await expect(page).toHaveURL(/\/hub\/$/);
      await expect(page.locator('.dev-home')).toBeVisible();
    });
  }

  test('browse failure exposes static images and links', async ({ page }) => {
    await page.route('**/*ResourceBrowser*', (route) => route.request().resourceType() === 'script' ? route.abort() : route.continue());
    await navigate(page, '/hub/browse/');
    const browser = page.locator('resource-browser');
    await expect(browser).not.toHaveAttribute('aria-busy');
    await expect(browser.locator('[data-browse-static]')).toContainText('Interactive browsing could not load');
    expect(await browser.locator('[data-resource-entry]:visible').count()).toBeGreaterThan(24);
    expect(await browser.locator('img').count()).toBeGreaterThan(0);
  });

  test('browse also enhances after leaving API documentation', async ({ page }) => {
    await navigate(page, '/reference/api/typescript/');
    await navigate(page, '/hub/browse/?q=redis');
    await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
    await expect(page.locator('#browse-search-input')).toHaveValue('redis');
    await expect(page.locator('main h1')).toHaveText('Browse resources');
    expect(await page.locator('[data-resource-entry]:not([hidden]) img').count()).toBeGreaterThan(0);
  });

  test('browse clear actions preserve query, facets and sorting independently', async ({ page }) => {
    await navigate(page, '/hub/browse/?q=aspire&type=blog&sort=oldest&title=desc');
    await page.locator('#browse-search-clear').click();
    await expect(page).toHaveURL(/\?type=blog&sort=oldest&title=desc$/);
    await page.locator('[data-reset-filters]').click();
    await expect(page).toHaveURL(/\?sort=oldest&title=desc$/);
    await navigate(page, '/hub/browse/?q=zzzz-no-match&type=blog&sort=oldest');
    await expect(page.locator('.browse-empty')).toBeVisible();
    await expect(page.locator('.browse-empty button')).toHaveText('Clear search');
    await page.locator('.browse-empty button').click();
    await expect(page).toHaveURL(/\?type=blog&sort=oldest$/);
    await expect(page.locator('#browse-search-input')).toBeFocused();
  });

  test('glossary clear actions distinguish text from topic filters', async ({ page }) => {
    await navigate(page, '/hub/glossary/?q=apphost&topic=foundations');
    await page.locator('#glossary-search-clear').click();
    await expect(page).toHaveURL(/\?topic=foundations$/);
    await page.locator('#glossary-clear-filters').click();
    await expect(page).toHaveURL(/\/hub\/glossary\/$/);
    await expect(page.locator('#glossary-search-input')).toHaveValue('');
    await navigate(page, '/hub/glossary/?q=zzzz-no-match');
    await expect(page.locator('[data-clear-glossary]')).toHaveText('Clear search');
    await page.locator('[data-clear-glossary]').click();
    await expect(page).toHaveURL(/\/hub\/glossary\/$/);
    await expect(page.locator('#glossary-search-input')).toBeFocused();
  });

  test('typing right after a glossary topic filter keeps the latest query', async ({ page }) => {
    await navigate(page, '/hub/glossary/');
    // Filters update the URL in place; if a filter ever triggered a (slow) document load, the typed query must still win.
    await page.route('**/hub/glossary/?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.continue();
    });
    await page.getByRole('button', { name: 'Foundations', exact: true }).click();
    await page.locator('#glossary-search-input').fill('apphost');
    await expect(page).toHaveURL(/\?q=apphost&topic=foundations$/);
    await expect(page.locator('#glossary-search-input')).toHaveValue('apphost');
    await expect(page.getByRole('button', { name: 'Foundations', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.unroute('**/hub/glossary/?*');
    await navigate(page, '/hub/');
    await page.goBack();
    await expect(page).toHaveURL(/\/hub\/glossary\/\?q=apphost&topic=foundations$/);
    await expect(page.locator('#glossary-search-input')).toHaveValue('apphost');
    await expect(page.getByRole('button', { name: 'Foundations', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
