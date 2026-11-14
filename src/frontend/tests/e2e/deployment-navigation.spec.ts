import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible, getSiteNavigationLink } from '@tests/e2e/helpers';

// This suite exercises native Document PiP, which needs the full browser rather than headless shell.
test.use({ channel: 'chromium' });

// Douze navigates with full page loads: every link and history step loads a new document.
async function navigateNative(page: Page, action: () => Promise<unknown>, path: RegExp | string) {
  const loaded = page.waitForEvent('load');
  await action();
  await loaded;
  if (typeof path === 'string') await page.waitForURL((url) => url.pathname === path);
  else await page.waitForURL(path);
}

test('same-deployment navigation and history load each page as a document', async ({ page }) => {
  const errors: string[] = [];
  const documents: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documents.push(new URL(request.url()).pathname);
    }
  });
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);
  await navigateNative(page, async () => (await getSiteNavigationLink(page, '/docs/')).click(), /\/docs\/$/);
  await expect(page.locator('main h1').first()).toBeVisible();
  await navigateNative(page, () => page.goBack(), '/');
  await expect(page.locator('header [data-open-install-modal]').first()).toBeAttached();
  await navigateNative(page, () => page.goForward(), /\/docs\/$/);
  await expect(page.locator('main h1').first()).toBeVisible();
  expect(documents.slice(0, 2)).toEqual(['/', '/docs/']);
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
    await (await getSiteNavigationLink(page, '/docs/')).evaluate((element) => {
      element.setAttribute('href', '/docs/?deployment-test=1#_top');
    });
    await page.locator(':is(header, .mobile-site-links) a[href^="/docs/?deployment-test=1"]:visible').click();
    await expect(page).toHaveURL(/\/docs\/\?deployment-test=1#_top$/);
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__deploymentSession')))
      .toBeUndefined();
    expect(nativeDocuments).toBe(1);
    expect(executions).toEqual([]);
    await expect(page.locator('site-search button[data-open-modal]')).toBeEnabled();
    await page.keyboard.press('Control+k');
    await expect(page.locator('site-search dialog[open]')).toBeVisible();
    await expect(
      page.locator('site-search input.pagefind-ui__search-input').or(
        page.locator('site-search').getByText(/Search is only available in production builds/i)
      )
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('native Document PiP closes on navigation and the next page starts clean', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Native Document Picture-in-Picture requires a desktop browser.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
      });
    });
    document.body.append(button);
  });
  const opened = page.context().waitForEvent('page');
  await page.locator('#native-pip-test').click();
  const pipPage = await opened;
  await expect(pipPage.locator('body')).toHaveText('Native PiP navigation test');

  // A full page load unloads the opener, which closes its Document PiP window.
  const closed = pipPage.waitForEvent('close');
  await navigateNative(page, async () => (await getSiteNavigationLink(page, '/docs/')).click(), /\/docs\/$/);
  await closed;
  expect(pipPage.isClosed()).toBe(true);
  expect(
    await page.evaluate(
      () => (window as Window & { documentPictureInPicture?: { window?: Window | null } }).documentPictureInPicture?.window ?? null
    )
  ).toBeNull();
  await expect(page.locator('#aspire-live-source-menu:visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});
