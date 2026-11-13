import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from './helpers';

test('shows the current release above collapsed previous major-version groups', async ({
  page,
}) => {
  await page.goto('/docs/');
  await dismissCookieConsentIfVisible(page);
  const menu = page.locator('starlight-menu-button button');
  if (await menu.isVisible()) await menu.click();

  const whatsNew = page.locator('.sidebar-content details').filter({
    has: page.locator('summary').filter({ hasText: /^What's new$/ }),
  });
  await whatsNew.locator(':scope > summary').click();
  const items = whatsNew.locator(':scope > ul > li');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).getByRole('link')).toHaveText('Aspire 17.0');
  await expect(items.nth(0).getByRole('link')).toHaveAttribute('href', '/whats-new/aspire-17/');
  await expect(items.nth(2).getByRole('link')).toHaveText('Upgrade Aspire');

  const previous = items.nth(1).locator(':scope > details');
  await expect(previous).not.toHaveAttribute('open');
  await previous.locator(':scope > summary').click();
  const majors = previous.locator(':scope > ul > li > details');
  await expect(majors).toHaveCount(2);
  for (const [index, major, latestMinor] of [
    [0, 13, 6],
    [1, 9, 5],
  ]) {
    const group = majors.nth(index);
    await expect(group.locator(':scope > summary')).toHaveText(`Aspire ${major}.x`);
    await expect(group).not.toHaveAttribute('open');
    await group.locator(':scope > summary').click();
    await expect(group.getByRole('link')).toHaveText(
      Array.from(
        { length: latestMinor + 1 },
        (_, offset) => `Aspire ${major}.${latestMinor - offset}`
      )
    );
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
