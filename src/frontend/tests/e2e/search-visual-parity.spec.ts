import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aspireConsentRequired', 'false'));
});

for (const route of [
  '/reference/api/typescript/',
  '/reference/api/csharp/',
  '/integrations/gallery/',
  '/reference/samples/',
  '/hub/glossary/',
  '/hub/browse/',
  '/aspireconf/',
]) {
  test(`${route} uses shared focus and empty-state typography`, async ({ page }) => {
    await page.goto(route === '/hub/browse/' ? `${route}?topic=foundations` : route);
    const input = page.locator('main .search-field-input');
    await expect(input).toBeEnabled();
    await input.fill('zzzz-no-match');
    const empty = page.locator('.search-empty:visible');
    await expect(empty).toBeVisible();

    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
      await input.focus();
      await expect(input).toBeFocused();
      await expect(input).toHaveCSS('outline-style', 'solid');
      await expect(input).toHaveCSS('outline-width', '2px');
      await expect(input).toHaveCSS('outline-offset', '2px');
      await expect(input).toHaveCSS('outline-color', theme === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
      await expect(input).toHaveCSS('box-shadow', 'none');
      if (route === '/hub/browse/') {
        const background = await input.evaluate((element) => getComputedStyle(element).backgroundColor);
        const dropdowns = page.locator('.browse-filter-group > summary');
        for (const dropdown of await dropdowns.all()) await expect(dropdown).toHaveCSS('background-color', background);
        const topic = page.locator('[data-filter-group="topic"] > summary');
        await topic.click();
        await expect(topic).toHaveCSS('background-color', background);
        await topic.press('Escape');
      }

      const colors = await empty.evaluate((element) => {
        const probe = document.createElement('span');
        probe.hidden = true;
        element.append(probe);
        const resolve = (token: string) => {
          probe.style.color = `var(${token})`;
          return getComputedStyle(probe).color;
        };
        const colors = {
          title: resolve('--sl-color-text'),
          hint: resolve('--sl-color-gray-2'),
          action: resolve('--sl-color-text-accent'),
        };
        probe.remove();
        return colors;
      });
      await expect(empty.locator('.search-empty-title')).toHaveCSS('color', colors.title);
      await expect(empty.locator('.search-empty-hint')).toHaveCSS('color', colors.hint);
      await expect(empty.locator('.search-action')).toHaveCSS('color', colors.action);
      await expect(empty.locator('.search-empty-title')).toHaveCSS('font-weight', '600');
      await expect(empty.locator('.search-empty-title')).toHaveCSS('font-size', '16px');
      await expect(empty.locator('.search-empty-title')).toHaveCSS('line-height', '24px');
      for (const selector of ['.search-empty-hint', '.search-action']) {
        await expect(empty.locator(selector)).toHaveCSS('font-size', '14px');
        await expect(empty.locator(selector)).toHaveCSS('line-height', '21px');
        await expect(empty.locator(selector)).toHaveCSS('font-weight', '400');
        await expect(empty.locator(selector)).toHaveCSS('font-style', 'normal');
      }
      const summary = page.locator('main .search-results-summary:visible');
      await expect(summary).toHaveCount(1);
      await expect(summary).toHaveCSS('font-size', '14px');
      await expect(summary).toHaveCSS('line-height', '21px');
      await expect(summary).toHaveCSS('font-weight', '400');
      await expect(summary).toHaveCSS('font-style', 'normal');
      await expect(summary).toHaveCSS('color', colors.hint);
    }
  });
}
