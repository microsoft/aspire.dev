import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

const typescriptPage = '/app-host/typescript-apphost/';
const ollamaPage = '/integrations/ai/ollama/ollama-host/';

async function waitForHovers(page: Page) {
  await expect(page.locator('.twoslash-hover > .twoslash-popup-container')).toHaveCount(0);
}

async function assertHovers(page: Page) {
  await waitForHovers(page);
  const hovers = page.locator('.twoslash-hover:visible');
  await expect(hovers.first()).toBeVisible();
  const count = await hovers.count();
  expect(count).toBeGreaterThan(5);

  // Check every token, not just the first: index-based pairing can show a
  // different token's popup, multiple popups, or nothing at all.
  for (let index = 0; index < count; index++) {
    const hover = hovers.nth(index);
    const token = (await hover.textContent())!.trim();
    for (let repeat = 0; repeat < 2; repeat++) {
      await hover.hover();
      const popup = page.locator('.twoslash-popup-container:visible');
      await expect(popup).toHaveCount(1);
      await expect(popup).toContainText(token);
      await expect(popup).toHaveAttribute('aria-hidden', 'false');
      await page.mouse.move(0, 0);
      await expect(popup).toHaveCount(0);
    }
  }
}

async function followLink(page: Page, path: string) {
  const link = page.locator(`a[href="${path}"]`).first();
  // Sidebar topics may be collapsed; reveal the actual navigation link.
  await link.evaluate((element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
  });
  await page.evaluate(() => {
    Reflect.set(window, '__twoslashPageLoaded', false);
    document.addEventListener(
      'astro:page-load',
      () => {
        Reflect.set(window, '__twoslashPageLoaded', true);
      },
      { once: true }
    );
  });
  await link.click();
  await expect(page).toHaveURL((url) => url.pathname === path);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__twoslashPageLoaded')))
    .toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, '__twoslashSession'))).toBe(true);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
}

test.describe('two-slash navigation', () => {
  test.skip(({ isMobile }) => isMobile, 'Mouse hover requires a desktop pointer');

  test('paints popups above following content in both themes', async ({ page }) => {
    await page.goto(ollamaPage);
    await dismissCookieConsentIfVisible(page);
    await waitForHovers(page);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await page.locator('.twoslash-hover', { hasText: 'withReference' }).first().hover();

      const popup = page.locator('.twoslash-popup-container:visible');
      await expect(popup).toHaveCount(1);
      await expect
        .poll(() =>
          popup.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const x = rect.left + Math.min(24, rect.width / 2);
            const y = rect.top + rect.height / 2;
            const topElement = document.elementFromPoint(x, y);
            return {
              background: getComputedStyle(element).backgroundColor,
              paintsOnTop: topElement === element || element.contains(topElement),
            };
          })
        )
        .toEqual({
          background: theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(39, 33, 46)',
          paintsOnTop: true,
        });
      await page.mouse.move(0, 0);
      await expect(popup).toHaveCount(0);
    }
  });

  test('shows the correct popup on direct load, client navigation, and repeated visits', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(typescriptPage);
    await dismissCookieConsentIfVisible(page);
    await page.evaluate(() => Reflect.set(window, '__twoslashSession', true));
    await assertHovers(page);

    for (let visit = 0; visit < 2; visit++) {
      await followLink(page, '/docs/');
      await followLink(page, typescriptPage);
      await assertHovers(page);
    }
    expect(errors).toEqual([]);
  });
});
