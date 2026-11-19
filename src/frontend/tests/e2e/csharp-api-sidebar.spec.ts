import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

const packagePath = '/reference/api/csharp/aspire.hosting.kubernetes/';
const typePath = `${packagePath}ingressbackendv1/`;
const sidebarSelector = '.topics-sidebar[data-api-ref] sl-sidebar-state-persist';
const treeLoaded = '.topics-sidebar[data-api-sidebar-tree-state="loaded"]';

type CompactNode = [string, string | CompactNode[]];

function countLinks(nodes: CompactNode[]): number {
  return nodes.reduce((count, [, value]) => count + (typeof value === 'string' ? 1 : countLinks(value)), 0);
}

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

test('type pages server-render a small spine and load the package tree once per package', async ({ page, request }) => {
  const html = await (await request.get(`${typePath}properties/`)).text();
  const ssrSidebar = html.match(/<sl-sidebar-state-persist[\s\S]*?<\/sl-sidebar-state-persist>/)?.[0] ?? '';
  const ssrLinks = ssrSidebar.match(/<a\s/g) ?? [];
  expect(ssrLinks.length).toBeGreaterThan(2);
  expect(ssrLinks.length).toBeLessThan(10);
  expect(ssrSidebar).toContain(`href="${typePath}properties/"`);
  expect(ssrSidebar).not.toContain(`href="${packagePath}kubernetesresource/"`);
  const treeSrc = html.match(/data-api-sidebar-tree="([^"]+)"/)?.[1];
  expect(treeSrc).toMatch(new RegExp(`^${packagePath.replace(/\./g, '\\.')}sidebar\\.json\\?v=[\\w-]+$`));

  const treeResponse = await request.get(treeSrc!);
  expect(treeResponse.ok()).toBe(true);
  const tree = await treeResponse.json() as { hash: string; items: CompactNode[] };
  // The URL version is the payload's content hash, so the edge can cache it immutably.
  expect(treeSrc!.endsWith(`?v=${tree.hash}`)).toBe(true);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const treeRequests: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.endsWith('/sidebar.json')) treeRequests.push(req.url());
  });

  await page.goto(`${typePath}properties/`);
  await expect(page.locator(treeLoaded)).toHaveCount(1);
  let sidebar = await sidebarOn(page);
  await expect(sidebar.locator('a')).toHaveCount(1 + countLinks(tree.items));
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', `${typePath}properties/`);
  await expect(sidebar.locator('details:has(a[aria-current="page"])')).toHaveCount(3);
  for (const details of await sidebar.locator('details:has(a[aria-current="page"])').all()) {
    await expect(details).toHaveAttribute('open', '');
  }

  // The filter covers the whole package once the tree has loaded.
  const filter = page.locator('#sidebar-filter-input');
  await filter.fill('KubernetesResource');
  await expect(sidebar.locator(`a[href="${packagePath}kubernetesresource/"]`)).toBeVisible();
  await page.locator('#sidebar-filter-clear').click();
  await expect(page.locator('#sidebar-filter-empty')).toBeHidden();

  await sidebar.locator(`a[href="${packagePath}"]`).first().click();
  await expect(page).toHaveURL(packagePath);
  await expect(page.locator(treeLoaded)).toHaveCount(1);
  sidebar = await sidebarOn(page);
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', packagePath);
  await expect(sidebar.locator(`a[href="${typePath}properties/"]`)).toHaveCount(1);
  expect(new Set(treeRequests).size).toBe(1);
  expect(errors).toEqual([]);
});

test('package overviews list every type without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(packagePath);
  const sidebar = page.locator(sidebarSelector);
  await expect(sidebar.locator('a')).toHaveCount(2);
  expect(await page.locator('#pkg-namespace-list a').count()).toBeGreaterThan(100);
  await expect(page.locator(`#pkg-namespace-list a[href="${typePath}"]`)).toHaveCount(1);
  await context.close();
});

test('the C# landing sidebar links to packages instead of embedding their trees', async ({ page }) => {
  await page.goto('/reference/api/csharp/');
  const sidebar = await sidebarOn(page);

  await expect(sidebar.locator('a[aria-current="page"]')).toHaveAttribute('href', '/reference/api/csharp/');
  await expect(sidebar.locator(`a[href="${packagePath}"]`)).toHaveCount(1);
  await expect(sidebar.locator('details')).toHaveCount(0);
  await expect(page.locator('.topics-sidebar[data-api-sidebar-tree]')).toHaveCount(0);
});
