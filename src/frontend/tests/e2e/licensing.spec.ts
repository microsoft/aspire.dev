import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from './helpers';

const licenseUrl = 'https://github.com/microsoft/aspire/blob/main/LICENSE.TXT';

for (const path of ['/', '/get-started/what-is-aspire/']) {
  test(`Aspire's MIT software license is discoverable on ${path}`, async ({ page }) => {
    await page.goto(path);
    await dismissCookieConsentIfVisible(page);

    const legal = page.getByRole('navigation', { name: 'Legal', exact: true });
    const license = legal.getByRole('link', { name: 'Aspire software: MIT License', exact: true });
    await expect(license).toHaveAttribute('href', licenseUrl);
    await license.scrollIntoViewIfNeeded();
    await expect(license).toBeVisible();
    await license.focus();
    await expect(license).toBeFocused();
    await license.click({ trial: true });
    const bounds = await license.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    await expect(legal.getByRole('link', { name: 'Terms of Use', exact: true })).toHaveAttribute(
      'href',
      'https://go.microsoft.com/fwlink/?LinkID=206977'
    );
    await expect(legal.getByRole('link', { name: 'Privacy & Cookies', exact: true })).toBeVisible();
    await expect(legal.getByRole('link', { name: 'Trademarks', exact: true })).toBeVisible();

    if (path !== '/') {
      const content = page.locator('.sl-markdown-content');
      await expect(content).toContainText(
        'It is open-source software licensed under the MIT License.'
      );
      await expect(content.getByRole('link', { name: 'MIT License', exact: true })).toHaveAttribute(
        'href',
        licenseUrl
      );
    }
  });
}
