import { expect, test } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('install modal owns one set of listeners and disposes outgoing controls', async ({
  page, isMobile,
}) => {
  test.skip(isMobile, 'Touch layouts use the full installation page.');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await dismissCookieConsentIfVisible(page);
  await page.evaluate(() => {
    const close = HTMLDialogElement.prototype.close;
    Reflect.set(window, '__installCloseCalls', 0);
    Reflect.set(window, '__installSession', true);
    HTMLDialogElement.prototype.close = function(value) {
      if (this.id === 'install-cli-modal') {
        Reflect.set(window, '__installCloseCalls', Number(Reflect.get(window, '__installCloseCalls')) + 1);
      }
      close.call(this, value);
    };
  });

  for (let visit = 0; visit < 3; visit++) {
    await page.evaluate(() => {
      document.dispatchEvent(new Event('astro:page-load'));
      document.dispatchEvent(new Event('astro:page-load'));
    });
    await page.locator('header [data-open-install-modal]:visible').click();
    const modal = page.locator('#install-cli-modal');
    await expect(modal).toBeVisible();
    const before = await page.evaluate(() => Reflect.get(window, '__installCloseCalls'));
    await modal.locator('[data-close-modal]').click();
    await expect(modal).toBeHidden();
    expect(await page.evaluate(() => Reflect.get(window, '__installCloseCalls'))).toBe(before + 1);
    await modal.evaluate(element => Reflect.set(window, '__outgoingInstallModal', element));

    const destination = visit % 2 === 0 ? '/docs/' : '/';
    await page.locator(`header a[href="${destination}"]:visible`).click();
    await expect(page).toHaveURL(url => url.pathname === destination);
    expect(await page.evaluate(() => Reflect.get(window, '__installSession'))).toBe(true);
    const calls = await page.evaluate(() => Reflect.get(window, '__installCloseCalls'));
    await page.evaluate(() => {
      const outgoing = Reflect.get(window, '__outgoingInstallModal') as HTMLDialogElement;
      outgoing.dispatchEvent(new Event('click'));
      outgoing.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(await page.evaluate(() => Reflect.get(window, '__installCloseCalls'))).toBe(calls);
  }
  expect(errors).toEqual([]);
});
