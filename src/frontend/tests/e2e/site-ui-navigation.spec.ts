import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

// The Douze site navigates with full page loads: follow a real anchor and wait for the destination document.
async function navigate(page: Page, href: string) {
  await page.evaluate((destination) => {
    const link = document.createElement('a');
    link.id = 'dependency-navigation-link';
    link.href = destination;
    link.textContent = 'Navigate to dependency test page';
    link.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
    document.body.append(link);
  }, href);
  await page.locator('#dependency-navigation-link').click();
  const destination = new URL(href, page.url());
  await page.waitForURL((url) => url.pathname === destination.pathname, { timeout: 30000 });
  await page.waitForLoadState('load');
}

test.describe('site UI navigation', () => {
  test.beforeEach(async ({ page }) => {
    // These runtime tests must never submit analytics events.
    await page.route('**/scripts/analytics/*.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: '',
      })
    );
    await page.addInitScript(() => {
      localStorage.setItem('starlight-theme', 'light');
      // Count renders per diagram element of each loaded document.
      const renders = new WeakMap<Element, number>();
      new MutationObserver((mutations) => {
        for (const { target } of mutations) {
          if (!(target instanceof Element) || !target.matches('pre.mermaid[data-processed]'))
            continue;
          const count = (renders.get(target) ?? 0) + 1;
          renders.set(target, count);
          target.setAttribute('data-test-render-count', String(count));
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-processed'],
      });
      // Record every scroll to the top, on each loaded document.
      const scrolls: ScrollToOptions[] = [];
      Reflect.set(window, '__dependencyScrolls', scrolls);
      const scrollTo = window.scrollTo.bind(window);
      window.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
        if (typeof options === 'number') scrollTo(options, y ?? 0);
        else {
          if (options?.top === 0) scrolls.push(options);
          scrollTo(options);
        }
      }) as typeof window.scrollTo;
    });
  });

  test('renders two diagrams once per page/theme across repeat visits and history', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (/\[(?:astro-)?mermaid\]/.test(message.text())) errors.push(message.text());
    });
    await page.goto('/docs/');
    await dismissCookieConsentIfVisible(page);
    const diagrams = page.locator('pre.mermaid');
    const expectRenders = async (count: number) => {
      await expect(diagrams).toHaveCount(2);
      for (const diagram of await diagrams.all()) {
        await expect(diagram.locator(':scope > svg')).toHaveCount(1, { timeout: 30000 });
        await expect(diagram).toHaveAttribute('data-test-render-count', String(count));
      }
    };
    for (let visit = 0; visit < 2; visit++) {
      await navigate(page, '/get-started/first-app/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expectRenders(1);
      // Re-setting the same theme must not render again.
      await page.evaluate(() => {
        const html = document.documentElement;
        const theme = html.getAttribute('data-theme')!;
        html.removeAttribute('data-theme');
        html.setAttribute('data-theme', theme);
      });
      await expectRenders(1);
      for (const [theme, count] of [
        ['dark', 2],
        ['light', 3],
      ] as const) {
        await page.locator(`#footer-theme-toggle [data-theme-option="${theme}"]`).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expectRenders(count);
      }
      await navigate(page, '/docs/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    }
    await page.goBack();
    await page.waitForURL((url) => url.pathname === '/get-started/first-app/');
    await page.waitForLoadState('load');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectRenders(1);
    expect(errors).toEqual([]);
  });

  test('activates scroll once per mouse, touch, Enter and Space across repeated visits', async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/docs/');
    await dismissCookieConsentIfVisible(page);
    for (let visit = 0; visit < 2; visit++) {
      await navigate(page, '/get-started/app-host/');
      const button = page.locator('#scroll-to-top-button');
      await expect(button).toHaveCount(1);
      for (const activation of ['pointer', 'Enter', 'Space']) {
        await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }));
        await expect(button).toBeVisible();
        const before = await page.evaluate(
          () => (Reflect.get(window, '__dependencyScrolls') as ScrollToOptions[]).length
        );
        if (activation === 'pointer') {
          if (isMobile) await button.tap();
          else await button.click();
        } else {
          await button.focus();
          await page.keyboard.press(activation);
        }
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        expect(
          await page.evaluate(
            (before) => (Reflect.get(window, '__dependencyScrolls') as ScrollToOptions[]).slice(before),
            before
          )
        ).toEqual([{ top: 0, behavior: 'auto' }]);
      }
      await navigate(page, '/docs/');
    }
  });
});
