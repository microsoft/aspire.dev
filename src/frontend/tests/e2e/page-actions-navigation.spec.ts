import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

const copySelector = '[data-page-action="copy-markdown"]';

async function navigateClient(page: Page, navigate: () => Promise<unknown>) {
  await page.evaluate(() => {
    Reflect.set(window, '__actionsPageLoaded', false);
    document.addEventListener(
      'astro:page-load',
      () => {
        Reflect.set(window, '__actionsPageLoaded', true);
      },
      { once: true }
    );
  });
  await navigate();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__actionsPageLoaded')))
    .toBe(true);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__actionsSession'))).toBe(true);
}

async function visitClient(page: Page, href: string) {
  await page.evaluate((destination) => {
    const link = document.createElement('a');
    link.id = 'actions-navigation-link';
    link.href = destination;
    link.textContent = 'Navigate to page actions test page';
    link.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
    document.body.append(link);
  }, href);
  await navigateClient(page, () => page.locator('#actions-navigation-link').click());
}

test.beforeEach(async ({ page, isMobile }) => {
  await page.route('**/scripts/analytics/*.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' })
  );
  await page.addInitScript((touch) => {
    if (touch) {
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: undefined,
      });
    }
    const copies: string[] = [];
    Reflect.set(window, '__actionsCopies', copies);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copies.push(text);
        },
      },
    });
  }, isMobile);
});

async function start(page: Page, href: string) {
  await page.goto(href);
  await dismissCookieConsentIfVisible(page);
  await page.evaluate(() => Reflect.set(window, '__actionsSession', true));
}

async function expectActions(page: Page, requests: string[]) {
  const copy = page.locator(copySelector);
  const path = await copy.getAttribute('data-path');
  const markdownPath = `${path}.md`;
  const copiesBefore = await page.evaluate(() => Reflect.get(window, '__actionsCopies').length);
  const requestsBefore = requests.length;
  // Repeated lifecycle events must not multiply handlers on the same elements.
  await page.evaluate(() => {
    document.dispatchEvent(new Event('astro:page-load'));
    document.dispatchEvent(new Event('astro:page-load'));
  });
  await copy.click();
  await expect(copy).toHaveClass(/copied/);
  expect(requests.slice(requestsBefore)).toEqual([markdownPath]);
  expect(await page.evaluate(() => Reflect.get(window, '__actionsCopies').slice(-1))).toEqual([
    `# Markdown for ${markdownPath}`,
  ]);
  expect(await page.evaluate(() => Reflect.get(window, '__actionsCopies').length)).toBe(
    copiesBefore + 1
  );

  const open = page.locator('#dropdown-0 > #dropdown-menu');
  const share = page.locator('#dropdown-1 > #dropdown-menu');
  await page.locator('#dropdown-0 > #dropdown-toggle').click();
  await expect(open).toBeVisible();
  await expect(open.locator('a[href$=".md"]')).toHaveAttribute('href', markdownPath);
  const copilot = await open.locator('a[href^="https://github.com/copilot/"]').getAttribute('href');
  expect(new URL(copilot!).searchParams.get('prompt')).toContain(page.url());
  await page.locator('#dropdown-1 > #dropdown-toggle').click();
  await expect(open).toBeHidden();
  await expect(share).toBeVisible();
  const linkedIn = await share.locator('a[href^="https://www.linkedin.com/"]').getAttribute('href');
  expect(new URL(linkedIn!).searchParams.get('url')).toBe(page.url());
  await page.locator('main h1#_top').click();
  await expect(share).toBeHidden();
}

for (const entry of ['/support/', '/docs/']) {
  test(`page actions survive repeated navigation and history from ${entry}`, async ({ page }) => {
    test.setTimeout(120000);
    const requests: string[] = [];
    // Static docs Markdown is emitted at build time, so serve deterministic
    // payloads in dev too. These tests cover action wiring, not Markdown generation.
    await page.route('**/*.md', (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      return route.fulfill({ contentType: 'text/markdown', body: `# Markdown for ${path}` });
    });
    await start(page, entry);
    if (entry === '/support/') await expectActions(page, requests);
    else await expect(page.locator(copySelector)).toHaveCount(0);
    for (let visit = 0; visit < 2; visit++) {
      await visitClient(page, '/get-started/prerequisites/');
      await expectActions(page, requests);
      await visitClient(page, '/support/');
      await expectActions(page, requests);
    }
    await navigateClient(page, () => page.goBack());
    await expectActions(page, requests);
    await navigateClient(page, () => page.goForward());
    await expectActions(page, requests);
    await visitClient(page, '/docs/');
    await expect(page.locator(copySelector)).toHaveCount(0);
    await visitClient(page, '/support/');
    await expectActions(page, requests);
  });
}

test('copy handles HTTP errors and recovers after client navigation', async ({ page }) => {
  await start(page, '/docs/');
  await visitClient(page, '/support/');
  const copy = page.locator(copySelector);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/support.md', (route) =>
    route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' })
  );
  await copy.click();
  await expect(copy).toHaveClass(/error/);
  await expect(copy).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, '__actionsCopies'))).toEqual([]);
  expect(errors.some((message) => message.includes('Failed to fetch Markdown: 503'))).toBe(true);
  await expect(copy).not.toHaveClass(/error/, { timeout: 5000 });
  await page.unroute('**/support.md');
  const requests: string[] = [];
  await page.route('**/support.md', (route) => {
    requests.push('/support.md');
    return route.fulfill({ contentType: 'text/markdown', body: '# Markdown for /support.md' });
  });
  await expectActions(page, requests);
});
