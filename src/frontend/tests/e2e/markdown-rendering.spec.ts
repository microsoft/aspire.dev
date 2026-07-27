import { expect, test } from '@playwright/test';

import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

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
