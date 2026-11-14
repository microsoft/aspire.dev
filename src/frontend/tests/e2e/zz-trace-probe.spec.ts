import { expect, test } from '@playwright/test';

// Temporary: fails on every attempt to check which retries keep a trace and a video. Remove before merging.
test('trace probe fails on every attempt', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One project is enough for the probe.');
  await page.goto('/');
  await expect(page.locator('h1').first()).toHaveText('This heading does not exist', { timeout: 2_000 });
});
