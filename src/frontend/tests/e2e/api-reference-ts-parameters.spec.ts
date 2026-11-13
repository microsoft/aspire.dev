import { expect, test } from '@playwright/test';

test('TypeScript function pages show parameter descriptions from the API data', async ({
  page,
}) => {
  await page.goto('/reference/api/typescript/aspire.hosting/withiconname/');

  const iconNameParam = page
    .locator('#signature ~ .ts-member-stack .mc-param')
    .filter({ has: page.locator('.mc-param-name', { hasText: /^\s*icon\s*Name\s*$/ }) });
  await expect(iconNameParam).toHaveCount(1);
  await expect(iconNameParam.locator('.mc-param-desc')).toContainText(
    'The name of the FluentUI icon to use.'
  );
  await expect(iconNameParam.locator('.mc-param-desc')).toBeVisible();
});
