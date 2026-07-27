import { expect, type Page } from '@playwright/test';

export async function resetCookieConsentState(page: Page): Promise<void> {
  await page.context().clearCookies();
}

export async function dismissCookieConsentIfVisible(page: Page): Promise<void> {
  const siteTourDismissButton = page.locator('[data-tour-action="dismiss"]');
  if (await siteTourDismissButton.isVisible().catch(() => false)) {
    await siteTourDismissButton.click();
  }

  const rejectAllButton = page.getByRole('button', { name: /reject all/i });
  if (await rejectAllButton.isVisible().catch(() => false)) {
    await rejectAllButton.click();
  }
}

export async function waitForAccessibilityEnhancements(page: Page): Promise<void> {
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.accessibilityEnhancementsReady ?? null)
    )
    .toBe('true');
}

export async function waitForApiSidebarReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'C# API Reference' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.hasAttribute('data-api-sidebar-ready'))
    )
    .toBe(true);
  await expect(page.locator('#sidebar-collapse-btn')).toBeAttached();
  await expect(page.locator('#sidebar-expand-btn')).toBeAttached();
  // Topics list (always-visible after the layout restructure) must
  // render with at least one link before downstream tests interact.
  await expect(
    page.locator('.topics-sidebar[data-api-ref] .starlight-sidebar-topics').first()
  ).toBeVisible();
  await expect
    .poll(async () => {
      const isCollapsed = await page.evaluate(() =>
        document.documentElement.hasAttribute('data-sidebar-collapsed')
      );
      const collapseVisible = await page.locator('#sidebar-collapse-btn').isVisible();
      const expandVisible = await page.locator('#sidebar-expand-btn').isVisible();

      return isCollapsed ? expandVisible && !collapseVisible : collapseVisible && !expandVisible;
    })
    .toBe(true);
}

export async function waitForTopicSidebarReady(page: Page): Promise<void> {
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.hasAttribute('data-topic-sidebar-ready'))
    )
    .toBe(true);
  await expect(page.locator('#topic-sidebar-collapse-btn')).toBeAttached();
  await expect(page.locator('#topic-sidebar-expand-btn')).toBeAttached();
  await expect(page.locator('#sidebar-filter-input')).toBeAttached();
  // Topics list (always-visible after the layout restructure) must
  // render with at least one link before downstream tests interact.
  await expect(
    page.locator('.topics-sidebar[data-topic-nav] .starlight-sidebar-topics').first()
  ).toBeVisible();
  await expect
    .poll(async () => {
      const isCollapsed = await page.evaluate(() =>
        document.documentElement.hasAttribute('data-topic-sidebar-collapsed')
      );
      const collapseVisible = await page.locator('#topic-sidebar-collapse-btn').isVisible();
      const expandVisible = await page.locator('#topic-sidebar-expand-btn').isVisible();

      return isCollapsed ? expandVisible && !collapseVisible : collapseVisible && !expandVisible;
    })
    .toBe(true);
}

export function isNarrowViewport(page: Page): boolean {
  const viewport = page.viewportSize();
  return Boolean(viewport && viewport.width < 800);
}
