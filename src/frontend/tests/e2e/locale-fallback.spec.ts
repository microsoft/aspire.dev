import { expect, test } from '@playwright/test';

/**
 * Untranslated locale routes aren't built. StaticHost (and, locally, the
 * `astro dev` middleware in `config/locale-fallback-dev-integration.mjs`) serves
 * the English page in place with the URL unchanged, and
 * `src/scripts/locale-fallback.ts` localizes the chrome: readers get localized
 * chrome, the untranslated-content notice, and navigation that stays in the locale.
 */

const untranslatedPath = '/de/get-started/install-cli/';
const untranslatedNotice = 'Dieser Inhalt ist noch nicht in deiner Sprache verfügbar.';

test('untranslated locale page shows localized chrome and the untranslated notice', async ({
  page,
}) => {
  await page.goto(untranslatedPath);

  await expect(page).toHaveURL(new RegExp(`${untranslatedPath}$`));
  await expect(page.getByText(untranslatedNotice)).toBeVisible();
  await expect(page.locator('h1#_top')).toHaveText('Install Aspire CLI');
  await expect(page.locator('nav.sidebar')).toContainText('Erste schritte');
  await expect(
    page.locator('nav.sidebar a[href="/de/get-started/prerequisites/"]').first()
  ).toBeAttached();
  await expect(page.locator('.pagination-links a').first()).toHaveAttribute('href', /^\/de\//);
  await expect(page.locator('#footer-language-select')).toHaveValue('de');
});

test('untranslated locale route serves the English page in place', async ({ page }) => {
  const response = await page.goto(untranslatedPath);

  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-language']).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-locale-fallback', 'de');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://aspire.dev/get-started/install-cli/'
  );
  await expect(page.locator('link[hreflang="de"]')).toHaveCount(0);
});

test('translated locale page is served as translated', async ({ page }) => {
  await page.goto('/ja/get-started/install-cli/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('html')).not.toHaveAttribute('data-locale-fallback', /.*/);
  await expect(page.locator('h1#_top')).not.toHaveText('Install Aspire CLI');
  await expect(page.getByText('このコンテンツはまだ日本語訳がありません。')).toHaveCount(0);
});
