import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

// This suite exercises native Document PiP, which needs the full browser rather than headless shell.
test.use({ channel: 'chromium' });

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'startViewTransition', {
        value: undefined,
        configurable: true,
      });
    });
  }
});

async function navigateClient(page: Page, action: () => Promise<unknown>) {
  await page.evaluate(() => {
    Reflect.set(window, '__deploymentPageLoaded', false);
    document.addEventListener(
      'astro:page-load',
      () => {
        Reflect.set(window, '__deploymentPageLoaded', true);
      },
      { once: true }
    );
  });
  await action();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__deploymentPageLoaded')))
    .toBe(true);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
}

test('same-deployment navigation and history preserve the running document', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);
  await page.evaluate(() => Reflect.set(window, '__deploymentSession', true));
  await navigateClient(page, () => page.locator('header a[href="/docs/"]:visible').click());
  await expect(page).toHaveURL(/\/docs\/$/);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__deploymentSession')))
    .toBe(true);
  await navigateClient(page, () => page.goBack());
  await expect(page).toHaveURL((url) => url.pathname === '/');
  expect(await page.evaluate(() => Reflect.get(window, '__deploymentSession'))).toBe(true);
  await navigateClient(page, () => page.goForward());
  await expect(page).toHaveURL(/\/docs\/$/);
  expect(await page.evaluate(() => Reflect.get(window, '__deploymentSession'))).toBe(true);
  expect(errors).toEqual([]);
});

for (const identity of ['changed', 'missing'] as const) {
  test(`${identity} deployment uses native navigation before incoming scripts execute`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const executions: string[] = [];
    let nativeDocuments = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction('__recordIncompatibleExecution', () => executions.push('executed'));
    await page.goto('/');
    await dismissCookieConsentIfVisible(page);
    await expect(page.locator('meta[name="git-commit-id"]')).not.toHaveAttribute('content', '');
    await page.evaluate(() => Reflect.set(window, '__deploymentSession', true));
    await page.route('**/docs/**', async (route) => {
      if (route.request().isNavigationRequest()) {
        nativeDocuments++;
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = (await response.text())
        .replace(
          /<meta name="git-commit-id" content="[^"]*"[^>]*>/,
          identity === 'missing' ? '' : '<meta name="git-commit-id" content="another-deployment">'
        )
        .replace('</head>', '<script>window.__recordIncompatibleExecution()</script></head>');
      await route.fulfill({ response, body });
    });
    await page.locator('header a[href="/docs/"]:visible').evaluate((element) => {
      element.setAttribute('href', '/docs/?deployment-test=1#_top');
    });
    await page.locator('header a[href^="/docs/?deployment-test=1"]:visible').click();
    await expect(page).toHaveURL(/\/docs\/\?deployment-test=1#_top$/);
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__deploymentSession')))
      .toBeUndefined();
    expect(nativeDocuments).toBe(1);
    expect(executions).toEqual([]);
    await expect(page.locator('site-search button[data-open-modal]')).toBeEnabled();
    await page.keyboard.press('Control+k');
    await expect(page.locator('site-search dialog[open]')).toBeVisible();
    await expect(page.locator('site-search input.pagefind-ui__search-input')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('native Document PiP survives same-build navigation and closes on a deployment reload', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Native Document Picture-in-Picture requires a desktop browser.');
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);
  const supported = await page.evaluate(() => 'documentPictureInPicture' in window);
  test.skip(!supported, 'This browser does not support native Document Picture-in-Picture.');

  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'native-pip-test';
    button.textContent = 'Open native PiP';
    button.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
    button.addEventListener('click', () => {
      const api = (
        window as Window & {
          documentPictureInPicture?: { requestWindow: () => Promise<Window> };
        }
      ).documentPictureInPicture;
      if (!api) throw new Error('Native Document Picture-in-Picture is unavailable.');
      void api.requestWindow().then((pip) => {
        pip.document.body.textContent = 'Native PiP navigation test';
        Reflect.set(window, '__nativePipTest', pip);
      });
    });
    document.body.append(button);
  });
  const opened = page.context().waitForEvent('page');
  await page.locator('#native-pip-test').click();
  const pipPage = await opened;
  await expect
    .poll(() => page.evaluate(() => Boolean(Reflect.get(window, '__nativePipTest'))))
    .toBe(true);
  await navigateClient(page, () => page.locator('header a[href="/docs/"]:visible').click());
  await expect(page).toHaveURL(/\/docs\/$/);
  expect(pipPage.isClosed()).toBe(false);
  await expect(pipPage.locator('body')).toHaveText('Native PiP navigation test');

  await page.route(new URL('/', page.url()).href, async (route) => {
    if (route.request().isNavigationRequest()) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /<meta name="git-commit-id" content="[^"]*"[^>]*>/,
      '<meta name="git-commit-id" content="another-deployment">'
    );
    await route.fulfill({ response, body });
  });
  const closed = pipPage.waitForEvent('close');
  await page.locator('header a[href="/"]:visible').click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await closed;
  await expect
    .poll(() => page.evaluate(() => Boolean(Reflect.get(window, '__nativePipTest'))))
    .toBe(false);
  expect(pipPage.isClosed()).toBe(true);
});
