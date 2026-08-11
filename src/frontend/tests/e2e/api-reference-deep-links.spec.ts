import { expect, test } from '@playwright/test';

const methodsPath =
  '/reference/api/csharp/aspire.hosting.sqlserver/sqlserverbuilderextensions/methods/';

test('C# method name and overload deep links scroll to and highlight the requested member', async ({
  page,
}) => {
  await page.goto(`${methodsPath}#withhostport`);
  const member = page.locator('#withhostport');
  await expect(member).toHaveCount(1);
  await expect(member).toBeInViewport();
  const highlightedBackground = await member.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );

  await page.goto(`${methodsPath}#withhostport-int32`);
  const exactAnchor = page.locator('#withhostport-int32');
  await expect(exactAnchor).toHaveCount(1);
  await expect.poll(() => exactAnchor.evaluate((element) => element.matches(':target'))).toBe(true);

  const exactMember = exactAnchor.locator('..');
  await expect(exactMember).toBeInViewport();
  await expect
    .poll(() => exactMember.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(highlightedBackground);
});
