import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('install modal owns one set of listeners on every page load', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch layouts use the full installation page.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Every navigation is a full page load, so count dialog closes from the start of each document.
  await page.addInitScript(() => {
    const close = HTMLDialogElement.prototype.close;
    Reflect.set(window, '__installCloseCalls', 0);
    HTMLDialogElement.prototype.close = function (value) {
      if (this.id === 'install-cli-modal') {
        Reflect.set(window, '__installCloseCalls', Number(Reflect.get(window, '__installCloseCalls')) + 1);
      }
      close.call(this, value);
    };
  });
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);

  const closeCalls = () => page.evaluate(() => Number(Reflect.get(window, '__installCloseCalls')));
  for (let visit = 0; visit < 3; visit++) {
    const modal = page.locator('#install-cli-modal');
    const open = page.locator('header [data-open-install-modal]:visible');

    await open.click();
    await expect(modal).toBeVisible();
    const beforeButton = await closeCalls();
    await modal.locator('[data-close-modal]').click();
    await expect(modal).toBeHidden();
    expect(await closeCalls()).toBe(beforeButton + 1);

    await open.click();
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(open).toBeFocused();

    const destination = visit % 2 === 0 ? '/docs/' : '/';
    await page.locator(`header a[href="${destination}"]:visible`).click();
    await page.waitForURL((url) => url.pathname === destination);
    await page.waitForLoadState('load');
    expect(await closeCalls()).toBe(0);
  }
  expect(errors).toEqual([]);
});
