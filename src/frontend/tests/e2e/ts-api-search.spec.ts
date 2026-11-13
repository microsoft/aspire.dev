import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible, isNarrowViewport } from '@tests/e2e/helpers';

test('TypeScript API search keeps result names visible on narrow viewports', async ({ page }) => {
  test.skip(!isNarrowViewport(page), 'This regression only applies to narrow/mobile viewports.');

  await page.goto('/reference/api/typescript/?q=withBun');
  await dismissCookieConsentIfVisible(page);

  const results = page.locator('#ts-api-search-results .api-search-result');
  await expect(results.first()).toBeVisible();

  const firstResult = results.first();
  const resultName = firstResult.locator('.api-search-result-name');
  const resultKind = firstResult.locator('.api-kind-micro');
  const resultPackage = firstResult.locator('.trailing .api-list-meta');

  await expect(firstResult).toBeVisible();
  await expect(resultName).toHaveText('withBun');
  await expect(resultName).toBeVisible();
  await expect(resultKind).toContainText(/method/i);
  await expect(resultKind).toBeVisible();
  await expect(resultPackage).toContainText('Aspire.Hosting.JavaScript');
  await expect(resultPackage).toBeVisible();

  await expect
    .poll(() => firstResult.evaluate((result) => {
      const name = result.querySelector('.api-search-result-name')!;
      const nameBox = name.getBoundingClientRect();
      const nameWrap = result.querySelector('.api-result-name-wrap')!.getBoundingClientRect();
      const kind = result.querySelector('.api-kind-micro')!.getBoundingClientRect();
      const metadata = result.querySelector('.trailing .api-list-meta')!.getBoundingClientRect();
      const row = result.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(name);
      const text = range.getBoundingClientRect();
      const separate = (a: DOMRect, b: DOMRect) =>
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      return {
        readable: text.width > 0 && [nameBox, nameWrap].every((box) =>
          text.left >= box.left && text.right <= box.right &&
          text.top >= box.top && text.bottom <= box.bottom,
        ),
        contained: [text, kind, metadata].every((box) =>
          box.left >= row.left && box.right <= row.right &&
          box.top >= row.top && box.bottom <= row.bottom,
        ),
        nonoverlapping: separate(text, kind) && separate(text, metadata) && separate(kind, metadata),
      };
    }))
    .toEqual({ readable: true, contained: true, nonoverlapping: true });
});