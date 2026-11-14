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

// The Douze site navigates with full page loads: follow a real anchor and wait for the destination document.
async function navigate(page: Page, destination: string): Promise<void> {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.id = 'mermaid-navigation-link';
    link.href = href;
    link.textContent = 'Navigate to diagram test page';
    link.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
    document.body.append(link);
  }, destination);
  await page.locator('#mermaid-navigation-link').click();
  await page.waitForURL((url) => url.pathname === destination, { timeout: 30000 });
  await page.waitForLoadState('load');
}

for (const theme of ['light', 'dark'] as const) {
  test(`Mermaid stays centered and responsive after navigation in ${theme} mode`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), theme);
    await page.goto('/get-started/app-host/');
    await dismissCookieConsentIfVisible(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectCenteredDiagrams(page);

    for (let visit = 0; visit < 2; visit++) {
      await navigate(page, '/docs/');
      await navigate(page, '/get-started/app-host/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectCenteredDiagrams(page);
    }
  });
}
