import { expect } from '@playwright/test';

export async function dismissCookieConsentIfVisible(page) {
  const rejectAllButton = page.getByRole('button', { name: /reject all/i });
  if (await rejectAllButton.isVisible().catch(() => false)) {
    await rejectAllButton.click();
  }
}

export function isNarrowViewport(page) {
  const viewport = page.viewportSize();
  return Boolean(viewport && viewport.width < 800);
}

async function readConsentCategories(page) {
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

export async function waitForConsentRecorded(page) {
  await expect.poll(() => readConsentCategories(page)).not.toBeNull();
}

export async function waitForAnalyticsConsent(page, expected) {
  await expect
    .poll(async () => {
      const categories = await readConsentCategories(page);
      return categories ? categories.includes('analytics') : null;
    })
    .toBe(expected);
}

export async function waitForConsentCategories(page, expectedCategories) {
  const sortedExpectedCategories = [...expectedCategories].sort();
  await expect.poll(() => readConsentCategories(page)).toEqual(sortedExpectedCategories);
}
