import { expect, test } from '@playwright/test';

import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test('rss feed endpoint returns XML with stylesheet and items', async ({ request }) => {
  const response = await request.get('/rss.xml');
  const contentType = response.headers()['content-type'] ?? '';
  const body = await response.text();

  expect(response.ok()).toBeTruthy();
  expect(contentType).toContain('xml');
  expect(body).toContain('<?xml');
  expect(body).toContain('<?xml-stylesheet');
  expect(body).toContain('/rss.xsl');
  expect(body).toContain('<rss');
  expect(body).toContain('<channel>');
  expect(body).toContain('<title>Aspire Docs</title>');
  expect(body).toContain('<description>Latest updates to the documentation</description>');
  expect(body).toContain('https://aspire.dev');
  expect(body).toMatch(/<item>[\s\S]*<\/item>/);
});

test('rss link opens the feed in a new tab', async ({ page }) => {
  await page.goto('/get-started/install-cli/');
  await dismissCookieConsentIfVisible(page);

  const rssLink = page.locator('.footer-socials a[href="/rss.xml"]');

  await expect(rssLink).toBeVisible();
  await expect(rssLink).toHaveAttribute('target', '_blank');
  await rssLink.scrollIntoViewIfNeeded();

  const [popup] = await Promise.all([page.waitForEvent('popup'), rssLink.click()]);

  try {
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup).toHaveURL(/\/rss\.xml$/);
  } finally {
    await popup.close();
  }
});
