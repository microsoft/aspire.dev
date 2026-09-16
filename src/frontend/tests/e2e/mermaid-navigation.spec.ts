import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

async function expectCenteredDiagrams(page: Page): Promise<void> {
  const diagrams = page.locator('.sl-markdown-content pre.mermaid:visible');
  await expect(diagrams.first().locator(':scope > svg')).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => diagrams.evaluateAll((elements) => {
    return elements.every((element) => {
      const svg = element.querySelector('svg');
      if (!svg) return false;
      const container = element.getBoundingClientRect();
      const diagram = svg.getBoundingClientRect();
      const centerOffset = Math.abs(
        diagram.x + diagram.width / 2 - (container.x + container.width / 2),
      );
      return centerOffset < 2 && diagram.width <= container.width && diagram.height > 0;
    });
  }), { timeout: 15000 }).toBe(true);
}

async function navigateClient(page: Page, destination: string): Promise<void> {
  await page.evaluate((href) => {
    Reflect.set(window, '__mermaidPageLoaded', false);
    document.addEventListener('astro:page-load', () => {
      Reflect.set(window, '__mermaidPageLoaded', true);
    }, { once: true });
    // Use a real anchor to exercise ClientRouter even on mobile's collapsed sidebar.
    const link = document.createElement('a');
    link.id = 'mermaid-navigation-link';
    link.href = href;
    link.textContent = 'Navigate to diagram test page';
    link.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
    document.body.append(link);
  }, destination);
  await page.locator('#mermaid-navigation-link').click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__mermaidPageLoaded')), {
    timeout: 30000,
  }).toBe(true);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__mermaidSession'))).toBe(true);
}

for (const theme of ['light', 'dark'] as const) {
  test(`Mermaid stays centered and responsive after client navigation in ${theme} mode`, async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(120000);
    if (isMobile) {
      // Exercise ClientRouter's swap fallback, as in the API navigation suite.
      await page.addInitScript(() => {
        Object.defineProperty(document, 'startViewTransition', {
          configurable: true,
          value: undefined,
        });
      });
    }
    await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.goto('/get-started/app-host/');
    await dismissCookieConsentIfVisible(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectCenteredDiagrams(page);
    await page.evaluate(() => Reflect.set(window, '__mermaidSession', true));

    for (let visit = 0; visit < 2; visit++) {
      await navigateClient(page, '/docs/');
      await navigateClient(page, '/get-started/app-host/');
      await expectCenteredDiagrams(page);
    }
  });
}
