import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test.setTimeout(120_000);

async function start(page: Page, path: string) {
  await page.goto(path);
  await dismissCookieConsentIfVisible(page);
}

function addLink(page: Page, href: string) {
  // Some filter pages have no direct links to each other: add a real anchor and click it.
  return page.evaluate((href) => {
    document.getElementById('filter-navigation-link')?.remove();
    const link = document.createElement('a');
    link.id = 'filter-navigation-link';
    link.href = href;
    link.textContent = 'Navigate to filter test destination';
    link.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;background:white;color:black';
    document.body.append(link);
  }, href);
}

// The site navigates with full page loads: wait for the destination document to load. Filter state that
// must survive (search text, selected filters) is restored on the new page from the URL or storage.
async function waitForPage(page: Page, path: string) {
  await page.waitForURL(new URL(path, page.url()).href, { timeout: 30_000 });
  await page.waitForLoadState('load');
}

async function navigate(page: Page, path: string) {
  await addLink(page, path);
  await page.locator('#filter-navigation-link').click();
  await waitForPage(page, path);
}

async function back(page: Page) {
  await page.goBack();
  await page.waitForLoadState('load');
}

test('version dropdowns rebind across API languages and repeated visits', async ({ page }) => {
  await start(page, '/reference/api/csharp/');

  for (const path of ['/reference/api/csharp/', '/reference/api/typescript/', '/reference/api/csharp/']) {
    if (new URL(page.url()).pathname !== path) await navigate(page, path);
    const button = page.locator('.version-filter-btn');
    const all = page.locator('.version-filter-cb[data-version="__all__"]');
    await navigate(page, '/reference/overview/');
    await navigate(page, path);
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(all).toBeChecked();
    await page.locator('.version-filter-all').click();
    await expect(all).not.toBeChecked();
    await expect(page.locator('.version-filter-btn')).toHaveClass(/none-selected/);
    await page.locator('.version-filter-all').click();
    await expect(all).toBeChecked();
    await expect(page.locator('.version-filter-btn')).not.toHaveClass(/none-selected/);
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    const input = page.locator(path.includes('/typescript/') ? '#ts-api-search-input' : '#api-search-input');
    await input.fill('Redis');
    await expect(page).toHaveURL(/q=Redis/);
    await navigate(page, '/reference/overview/');
    await back(page);
    await expect(input).toHaveValue('Redis');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
  }
});

test('integration filters restore on Back and cancel input when leaving', async ({ page }) => {
  await start(page, '/integrations/gallery/');
  const input = page.locator('.search-box');
  const cards = page.locator('.card-grid .card:visible');

  for (let visit = 0; visit < 2; visit++) {
    await input.fill('zzzznonexistent');
    await expect(cards).toHaveCount(0);
    await expect(page.locator('.no-results')).toBeVisible();
    await navigate(page, '/reference/overview/');
    await back(page);
    await expect(input).toHaveValue('zzzznonexistent');
    await expect(cards).toHaveCount(0);
    await page.locator('.clear-button').click();
    await expect(cards.first()).toBeVisible();
    const official = page.locator('.type-toggle[data-type="official"]');
    await official.click();
    await expect(official).not.toHaveClass(/active/);
    await official.click();
    await expect(official).toHaveClass(/active/);
  }

  // Type and leave in the same task, so the search debounce is still pending when the page unloads:
  // the departed page's input must not leak into the destination.
  await addLink(page, '/reference/overview/?keep=1');
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('.search-box')!;
    input.value = 'stale-query-from-gallery';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('filter-navigation-link')!.click();
  });
  await waitForPage(page, '/reference/overview/?keep=1');
  await page.waitForTimeout(650);
  await expect(page).toHaveURL(/\/reference\/overview\/\?keep=1$/);
});

test('sample search, tags and reset survive repeated navigation', async ({ page }) => {
  await start(page, '/reference/samples/');
  const input = page.locator('[data-search-input]');
  const items = page.locator('[data-sample-item]:visible');
  for (let visit = 0; visit < 2; visit++) {
    await input.fill('zzzznonexistent');
    await expect(items).toHaveCount(0);
    await navigate(page, '/reference/overview/');
    await back(page);
    await expect(input).toHaveValue('zzzznonexistent');
    await expect(items).toHaveCount(0);
    await page.locator('[data-reset-btn]').click();
    await expect(items.first()).toBeVisible();
    const chip = page.locator('[data-tag]').first();
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/tags=/);
    await page.locator('[data-clear-filters]').click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(page).not.toHaveURL(/tags=/);
  }
});
