import { expect, type Page } from '@playwright/test';

export async function dismissCookieConsentIfVisible(page: Page): Promise<void> {
  const rejectAllButton = page.getByRole('button', { name: /reject all/i });
  if (await rejectAllButton.isVisible().catch(() => false)) {
    await rejectAllButton.click();
  }
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
