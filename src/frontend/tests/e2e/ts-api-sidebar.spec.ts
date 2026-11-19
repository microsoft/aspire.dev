import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

const modulePath = '/reference/api/typescript/aspire.hosting.azure.provisioning.network/';
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

type CompactNode = [string, string | CompactNode[]];

function countLinks(nodes: CompactNode[]): number {
  return nodes.reduce((count, [, value]) => count + (typeof value === 'string' ? 1 : countLinks(value)), 0);
}

/** Wait for the module tree to replace the server-rendered spine. */
async function treeLinkCount(page: Page): Promise<number> {
  await expect(page.locator('.topics-sidebar[data-api-sidebar-tree-state="loaded"]')).toHaveCount(1);
  const src = await page.locator('.topics-sidebar[data-api-sidebar-tree]').getAttribute('data-api-sidebar-tree');
  const tree = await (await page.request.get(src!)).json() as { items: CompactNode[] };
  return countLinks(tree.items);
}

async function expectSpineHtml(page: Page, path: string, maxLinks: number): Promise<void> {
  const html = await (await page.request.get(path)).text();
  const spine = html.match(/<sl-sidebar-state-persist[\s\S]*?<\/sl-sidebar-state-persist>/)?.[0] ?? '';
  const count = spine.match(/<a\s/g)?.length ?? 0;
  expect(count).toBeGreaterThan(1);
  expect(count).toBeLessThanOrEqual(maxLinks);
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

test('a large module renders a spine per page and loads its catalog tree once', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const treeRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/sidebar.json')) treeRequests.push(req.url());
  });
  await expectSpineHtml(page, `${modulePath}virtualnetworkproxy/`, 5);
  await page.goto(`${modulePath}virtualnetworkproxy/`);
  let sidebar = await sidebarOn(page);
  // Search root + the module tree, with the item expanded to its overview and two section links.
  const treeLinks = await treeLinkCount(page);
  expect(treeLinks).toBeGreaterThan(1000);
  await expect(sidebar.locator('a')).toHaveCount(1 + treeLinks + 2);
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', `${modulePath}virtualnetworkproxy/`);
  await expect(sidebar.getByRole('link', { name: 'Properties', exact: true })).toHaveCount(1);
  await expectLocalAnchors(page, sidebar);

  const filter = page.locator('#sidebar-filter-input');
  await filter.fill('no-such-navigation-link');
  await expect(page.locator('#sidebar-filter-empty')).toBeVisible();
  await page.locator('#sidebar-filter-clear').click();
  await expect(page.locator('#sidebar-filter-empty')).toBeHidden();
  await setMobileMenuOpen(page, false);

  // Follow an actual generated method URL, including its overload suffix.
  const firstMethod = page.locator(`#type-content-sections a[href^="${modulePath}virtualnetworkproxy/"]`).first();
  const methodHref = await firstMethod.getAttribute('href');
  expect(methodHref).toBeTruthy();
  await firstMethod.click();
  await expect(page).toHaveURL(new URL(methodHref!, page.url()).href);
  sidebar = await sidebarOn(page);
  // The member page adds its overview and its Signature and Defined on sections.
  await expect(sidebar.locator('a')).toHaveCount(1 + (await treeLinkCount(page)) + 3);
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', methodHref!);
  await expectLocalAnchors(page, sidebar);

  await sidebar.locator(`a[href="${modulePath}virtualnetworkproxy/"]`).click();
  await expect(page).toHaveURL(`${modulePath}virtualnetworkproxy/`);
  sidebar = await sidebarOn(page);
  await sidebar.locator(`a[href="${modulePath}"]`).click();
  await expect(page).toHaveURL(modulePath);
  sidebar = await sidebarOn(page);
  // The overview keeps its Types, Functions and Enums section links beside the tree.
  await expect(sidebar.locator('a')).toHaveCount(1 + (await treeLinkCount(page)) + 3);
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', modulePath);
  expect(await page.locator('#pkg-namespace-list a').count()).toBeGreaterThan(1000);
  await expectLocalAnchors(page, sidebar);
  await setMobileMenuOpen(page, false);
  await page.locator('#pkg-search-input').fill('VirtualNetworkProxy');
  await expect(page.locator(`#pkg-search-results a[title="VirtualNetworkProxy"][href="${modulePath}virtualnetworkproxy/"]`)).toBeVisible();
  expect(new Set(treeRequests).size).toBe(1);
  expect(errors).toEqual([]);
});
