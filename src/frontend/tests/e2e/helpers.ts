import { expect, type Page } from '@playwright/test';

export async function dismissCookieConsentIfVisible(page: Page): Promise<void> {
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

export function isNarrowViewport(page: Page): boolean {
  const viewport = page.viewportSize();
  return Boolean(viewport && viewport.width < 800);
}

async function readConsentCategories(page: Page): Promise<string[] | null> {
  try {
    return await page.evaluate(() => {
      const cookieEntry = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('cc_cookie='));

      if (!cookieEntry) {
        return null;
      }

      const [, rawValue = ''] = cookieEntry.split('=');
      const parsed = JSON.parse(decodeURIComponent(rawValue));
      return Array.isArray(parsed?.categories) ? parsed.categories.slice().sort() : null;
    });
  } catch {
    return null;
  }
}

export async function waitForConsentRecorded(page: Page): Promise<void> {
  await expect.poll(() => readConsentCategories(page)).not.toBeNull();
}

export async function waitForAnalyticsConsent(page: Page, expected: boolean): Promise<void> {
  await expect
    .poll(async () => {
      const categories = await readConsentCategories(page);
      return categories ? categories.includes('analytics') : null;
    })
    .toBe(expected);
}

export async function waitForConsentCategories(
  page: Page,
  expectedCategories: string[]
): Promise<void> {
  const sortedExpectedCategories = [...expectedCategories].sort();
  await expect.poll(() => readConsentCategories(page)).toEqual(sortedExpectedCategories);
}
