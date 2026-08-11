import { expect, test } from '@playwright/test';

test('C# method name deep links scroll to the requested member', async ({ page }) => {
  await page.goto(
    '/reference/api/csharp/aspire.hosting.sqlserver/sqlserverbuilderextensions/methods/#withhostport'
  );

  const member = page.locator('#withhostport');
  await expect(member).toHaveCount(1);
  await expect(member).toBeInViewport();
});
