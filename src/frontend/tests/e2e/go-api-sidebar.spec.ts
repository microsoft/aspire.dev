import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

const modulePath = '/reference/api/go/aspire.hosting.redis/';
const itemPath = `${modulePath}redisresource/`;
const sidebarSelector = '.topics-sidebar[data-api-ref] sl-sidebar-state-persist';

test.beforeEach(async ({ page, isMobile }) => {
  // Exercise ClientRouter's touch fallback, as in the cross-language API suite.
  if (isMobile) {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: undefined,
      });
    });
  }
});

async function setMobileMenuOpen(page: Page, open: boolean): Promise<void> {
  const menu = page.locator('starlight-menu-button');
  const button = menu.locator('button');
  if (await button.isVisible() && ((await menu.getAttribute('aria-expanded')) === 'true') !== open) {
    await button.click();
    await expect(menu).toHaveAttribute('aria-expanded', String(open));
  }
}

async function sidebarOn(page: Page): Promise<Locator> {
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.hasAttribute('data-api-sidebar-ready'),
  )).toBe(true);
  await dismissCookieConsentIfVisible(page);
  await setMobileMenuOpen(page, true);
  const expandButton = page.locator('#sidebar-expand-btn');
  if (await expandButton.isVisible()) await expandButton.click();
  return page.locator(sidebarSelector);
}

async function expectLocalAnchors(page: Page, sidebar: Locator): Promise<void> {
  const broken = await sidebar.locator('a[href*="#"]').evaluateAll((anchors) =>
    anchors.flatMap((anchor) => {
      const url = new URL(anchor.getAttribute('href')!, location.href);
      return url.pathname === location.pathname && !document.getElementById(decodeURIComponent(url.hash.slice(1)))
        ? [url.href]
        : [];
    }),
  );
  expect(broken).toEqual([]);
}

test('a module catalog is shared through overview links, not repeated on detail pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(itemPath);
  let sidebar = await sidebarOn(page);

  // Search root + module overview + item overview + the item's own section links.
  const sectionLinkCount = await sidebar.locator('a[href*="#"]').count();
  expect(sectionLinkCount).toBeGreaterThan(0);
  await expect(sidebar.locator('a')).toHaveCount(3 + sectionLinkCount);
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', itemPath);
  await expect(sidebar.locator(`a[href="${modulePath}"]`)).toHaveCount(1);
  await expect(sidebar.locator('a[href="/reference/api/go/"]')).toHaveCount(1);
  await expect(sidebar.getByRole('link', { name: 'Methods', exact: true })).toHaveCount(1);
  await expectLocalAnchors(page, sidebar);

  const filter = page.locator('#sidebar-filter-input');
  await filter.fill('no-such-navigation-link');
  await expect(page.locator('#sidebar-filter-empty')).toBeVisible();
  await page.locator('#sidebar-filter-clear').click();
  await expect(page.locator('#sidebar-filter-empty')).toBeHidden();
  await setMobileMenuOpen(page, false);

  // Follow an actual generated method URL, including any overload suffix.
  const firstMethod = page.locator(`#type-content-sections a[href^="${itemPath}"]`).first();
  const methodHref = await firstMethod.getAttribute('href');
  expect(methodHref).toBeTruthy();
  await firstMethod.click();
  await expect(page).toHaveURL(new URL(methodHref!, page.url()).href);
  sidebar = await sidebarOn(page);
  // Search root + module, item and member overviews + the member's Signature and Defined on sections.
  await expect(sidebar.locator('a')).toHaveCount(6);
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', methodHref!);
  await expectLocalAnchors(page, sidebar);

  await sidebar.locator(`a[href="${itemPath}"]`).click();
  await expect(page).toHaveURL(itemPath);
  sidebar = await sidebarOn(page);
  await sidebar.locator(`a[href="${modulePath}"]`).click();
  await expect(page).toHaveURL(modulePath);
  sidebar = await sidebarOn(page);
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', modulePath);
  expect(await page.locator('#pkg-namespace-list a').count()).toBeGreaterThan(5);
  await expectLocalAnchors(page, sidebar);
  await setMobileMenuOpen(page, false);
  await page.locator('#pkg-search-input').fill('RedisResource');
  await expect(page.locator(`#pkg-search-results a[title="RedisResource"][href="${itemPath}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Go landing sidebar lists modules and marks the API search as current', async ({ page }) => {
  await page.goto('/reference/api/go/');
  const sidebar = await sidebarOn(page);

  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', '/reference/api/go/');
  await expect(sidebar.locator(`a[href="${modulePath}"]`)).toHaveCount(1);
});
