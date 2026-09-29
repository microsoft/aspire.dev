import { expect, test } from '@playwright/test';

import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('FileTree file and folder icons retain visible dimensions', async ({ page }) => {
  await page.goto('/get-started/first-app/?aspire-lang=typescript');
  await dismissCookieConsentIfVisible(page);

  const tree = page.locator('starlight-file-tree:visible').filter({ hasText: 'index.ts' }).first();
  await expect(tree).toBeVisible();
  const fileIcons = tree.locator('.file:visible .tree-icon');
  expect(await fileIcons.count()).toBeGreaterThan(10);

  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((html, value) => {
      html.dataset.theme = value;
    }, theme);

    for (const icon of await fileIcons.all()) {
      await expect(icon).toHaveCSS('display', 'inline-block');
      await expect(icon).toHaveCSS('vertical-align', 'middle');
      const bounds = await icon.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(12);
      expect(bounds?.height).toBeGreaterThanOrEqual(12);
      await expect(icon).not.toHaveCSS('background-image', 'none');
    }
  }

  const sourceFolder = tree.locator('summary').filter({ hasText: 'src/' }).first();
  await expect(sourceFolder.locator('.icon-open')).toBeVisible();
  await expect(sourceFolder.locator('.icon-closed')).toBeHidden();
  await sourceFolder.click();
  await expect(sourceFolder.locator('.icon-closed')).toBeVisible();
  await expect(sourceFolder.locator('.icon-open')).toBeHidden();
  await sourceFolder.click();
  await expect(sourceFolder.locator('.icon-open')).toBeVisible();
});

test('contributor guide renders common Markdown as semantic HTML', async ({ page }) => {
  await page.goto('/community/contributor-guide/#write-markdown');
  await dismissCookieConsentIfVisible(page);

  const main = page.locator('main');
  await expect(page.getByRole('heading', { name: /Write Markdown/i })).toBeVisible();

  const markdownTable = main
    .locator('table')
    .filter({ hasText: 'Dashboard' })
    .filter({ hasText: 'OpenTelemetry support' })
    .first();

  await expect(markdownTable).toBeVisible();
  await expect(markdownTable.locator('thead th')).toHaveText([
    'Feature',
    'Description',
    'Status',
  ]);
  await expect(markdownTable.locator('tbody tr')).toHaveCount(3);
  await expect(markdownTable).toContainText('Kubernetes deployment');

  await expect(main.locator('p').filter({ hasText: /^\|\s*Feature\s*\|/ })).toHaveCount(0);
  await expect(main.getByRole('complementary', { name: 'Tip' }).first()).toBeVisible();
  await expect(main.getByRole('link', { name: 'David Pine' })).toHaveAttribute(
    'href',
    /https:\/\/davidpine\.net\/?/
  );
  await expect(main.locator('p code').filter({ hasText: 'Inline code' })).toBeVisible();
  await expect(
    main.locator('pre code').filter({ hasText: 'builder.AddProject<Projects.ApiService>' }).first()
  ).toBeVisible();
  await expect(
    main.locator('blockquote').filter({ hasText: 'This is a note or important callout.' })
  ).toBeVisible();
  await expect(main.locator('hr')).toHaveCount(1);
  await expect(main.locator('del').filter({ hasText: 'This text is crossed out' })).toBeVisible();

  const completedTask = main
    .locator('li')
    .filter({ hasText: 'Add Aspire to your project' })
    .locator('input[type="checkbox"]');
  const pendingTask = main
    .locator('li')
    .filter({ hasText: 'Deploy to Azure' })
    .locator('input[type="checkbox"]');

  await expect(completedTask).toBeChecked();
  await expect(pendingTask).not.toBeChecked();
  await expect(main.locator('ul').filter({ hasText: 'First item' }).first()).toBeVisible();
  await expect(main.locator('ol').filter({ hasText: 'First step' }).first()).toBeVisible();
});
