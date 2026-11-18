import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from './helpers';

async function openSidebar(page: Page, path: string) {
  await page.goto(path);
  await dismissCookieConsentIfVisible(page);
  const menu = page.locator('starlight-menu-button button');
  if (await menu.isVisible()) await menu.click();
  return page.locator('#starlight__sidebar');
}

test.describe('sidebar controls', () => {
  test('expand/collapse all toggles every group and tracks manual changes', async ({ page }) => {
    const sidebar = await openSidebar(page, '/integrations/');
    const toggle = sidebar.locator('.sidebar-toggle-all');
    const groups = sidebar.locator('sl-sidebar-state-persist details');

    await expect(toggle).toHaveAttribute('aria-label', 'Expand all');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse all');
    expect(
      await groups.evaluateAll((all) => all.every((d) => (d as HTMLDetailsElement).open))
    ).toBe(true);

    await groups.first().locator(':scope > summary').click();
    await expect(toggle).toHaveAttribute('aria-label', 'Expand all');

    await toggle.click();
    await toggle.click();
    expect(await groups.evaluateAll((all) => all.some((d) => (d as HTMLDetailsElement).open))).toBe(
      false
    );
    await expect(toggle).toHaveAttribute('aria-label', 'Expand all');
  });

  test('filter row stays pinned while long lists scroll and labels wrap', async ({ page }) => {
    const sidebar = await openSidebar(page, '/integrations/');
    await sidebar.locator('.sidebar-toggle-all').click();
    await sidebar.evaluate((pane) => (pane.scrollTop = 1500));

    const row = sidebar.locator('.sidebar-filter-row');
    await expect
      .poll(async () => {
        const [rowBox, paneBox] = await Promise.all([row.boundingBox(), sidebar.boundingBox()]);
        return Math.round((rowBox?.y ?? -1) - (paneBox?.y ?? 0));
      })
      .toBe(0);

    const [rowColor, paneColor] = await Promise.all([
      row.evaluate((el) => getComputedStyle(el).backgroundColor),
      sidebar.evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);
    expect(rowColor).toBe(paneColor);
    expect(await sidebar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('badged entries wrap instead of overflowing the sidebar', async ({ page }) => {
    const sidebar = await openSidebar(page, '/extensibility/typescript-hosting-integrations/');
    const badged = sidebar.locator('a[aria-current="page"]:has(> .sl-badge)');
    await expect(badged).toBeVisible();
    const [link, pane] = await Promise.all([badged.boundingBox(), sidebar.boundingBox()]);
    expect((link?.x ?? 0) + (link?.width ?? 0)).toBeLessThanOrEqual(
      (pane?.x ?? 0) + (pane?.width ?? 0)
    );
    expect(await sidebar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('collapse button aligns with the pinned filter on wide screens', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      'Persistent sidebar toggle is desktop-only'
    );
    await page.setViewportSize({ width: 1800, height: 900 });
    const sidebar = await openSidebar(page, '/integrations/');
    const center = (selector: string) =>
      page.locator(selector).evaluate((el) => {
        const box = el.getBoundingClientRect();
        return Math.round((box.top + box.bottom) / 2);
      });
    await sidebar.locator('.sidebar-toggle-all').click();
    await sidebar.evaluate((pane) => (pane.scrollTop = 1500));
    await expect
      .poll(() => center('#topic-sidebar-collapse-btn'))
      .toBe(await center('.sidebar-filter-wrap'));
  });
});

test.describe('tooltips', () => {
  test('auto-dismiss after touch input even while :hover sticks', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      'Needs a hover-capable pointer to pin :hover'
    );
    const sidebar = await openSidebar(page, '/integrations/');
    // Touch browsers keep :hover on the tapped element; reproduce that by marking the last pointer
    // as touch and leaving the mouse parked over the trigger.
    await page.evaluate(() =>
      document.dispatchEvent(
        new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })
      )
    );
    await sidebar.locator('.sidebar-toggle-all').hover();
    await expect(page.locator('.tippy-box')).toBeVisible();
    await expect(page.locator('.tippy-box')).toHaveCount(0, { timeout: 3000 });
  });
});
