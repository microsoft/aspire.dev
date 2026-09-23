import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

async function navigateClient(page: Page, href: string) {
  await page.evaluate((destination) => {
    Reflect.set(window, '__dependencyPageLoaded', false);
    document.addEventListener(
      'astro:page-load',
      () => {
        Reflect.set(window, '__dependencyPageLoaded', true);
      },
      { once: true }
    );
    const link = document.createElement('a');
    link.id = 'dependency-navigation-link';
    link.href = destination;
    link.textContent = 'Navigate to dependency test page';
    link.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
    document.body.append(link);
  }, href);
  await page.locator('#dependency-navigation-link').click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__dependencyPageLoaded')), {
      timeout: 30000,
    })
    .toBe(true);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__dependencySession'))).toBe(true);
}

for (const fallback of [false, true]) {
  test.describe(fallback ? 'site UI swap fallback' : 'site UI native transitions', () => {
    test.beforeEach(async ({ page, isMobile }) => {
      test.skip(
        isMobile && !fallback,
        'Chromium touch emulation aborts native transitions; touch projects cover the swap fallback.'
      );
      // These runtime tests must never submit analytics events.
      await page.route('**/scripts/analytics/*.js', (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: '',
        })
      );
      await page.addInitScript((swap) => {
        localStorage.setItem('starlight-theme', 'light');
        if (swap) {
          Object.defineProperty(document, 'startViewTransition', {
            configurable: true,
            value: undefined,
          });
        }
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
      }, fallback);
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
      await page.evaluate(() => Reflect.set(window, '__dependencySession', true));
      const diagrams = page.locator('pre.mermaid');
      const expectRenders = async (count: number) => {
        await expect(diagrams).toHaveCount(2);
        for (const diagram of await diagrams.all()) {
          await expect(diagram.locator(':scope > svg')).toHaveCount(1, { timeout: 30000 });
          await expect(diagram).toHaveAttribute('data-test-render-count', String(count));
        }
      };
      for (let visit = 0; visit < 2; visit++) {
        await navigateClient(page, '/get-started/first-app/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await expectRenders(1);
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
        await navigateClient(page, '/docs/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      }
      await page.goBack();
      await expectRenders(1);
      expect(await page.evaluate(() => Reflect.get(window, '__dependencySession'))).toBe(true);
      expect(errors).toEqual([]);
    });

    test('activates scroll once per mouse, touch, Enter and Space after repeated swaps', async ({
      page,
      isMobile,
    }) => {
      test.setTimeout(120000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/docs/');
      await dismissCookieConsentIfVisible(page);
      await page.evaluate(() => {
        Reflect.set(window, '__dependencySession', true);
        const scrolls: ScrollToOptions[] = [];
        Reflect.set(window, '__dependencyScrolls', scrolls);
        const scrollTo = window.scrollTo.bind(window);
        window.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
          if (typeof options === 'number') scrollTo(options, y ?? 0);
          else {
            if (options?.top === 0) scrolls.push(options);
            scrollTo(options);
          }
        };
      });
      for (let visit = 0; visit < 2; visit++) {
        await navigateClient(page, '/get-started/app-host/');
        const button = page.locator('#scroll-to-top-button');
        await expect(button).toHaveCount(1);
        for (const activation of ['pointer', 'Enter', 'Space']) {
          await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }));
          await expect(button).toBeVisible();
          await page.evaluate(() =>
            Reflect.set(
              window,
              '__dependencyScrollCountBefore',
              Reflect.get(window, '__dependencyScrolls').length
            )
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
            await page.evaluate(() => {
              const scrolls: ScrollToOptions[] = Reflect.get(window, '__dependencyScrolls');
              const before: number = Reflect.get(window, '__dependencyScrollCountBefore');
              return scrolls.slice(before);
            })
          ).toEqual([{ top: 0, behavior: 'auto' }]);
        }
        await navigateClient(page, '/docs/');
      }
    });
  });
}
