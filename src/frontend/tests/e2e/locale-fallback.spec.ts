import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

/**
 * Untranslated locale routes aren't built. StaticHost (and, locally, the
 * `astro dev` middleware in `config/locale-fallback-dev-integration.mjs`) serves
 * the English page in place with the URL unchanged, and
 * `src/scripts/locale-fallback.ts` localizes the chrome: readers get localized
 * chrome, the untranslated-content notice, and navigation that stays in the locale.
 */

const untranslatedPath = '/de/get-started/install-cli/';
const untranslatedNotice = 'Dieser Inhalt ist noch nicht in deiner Sprache verfügbar.';

// Exercise native transitions on desktop and the swap fallback on touch
// projects, matching the other client-navigation suites.
test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: undefined,
      });
    });
  }
});

/** Clicks a link to `href`, which `ClientRouter` handles without a full reload. */
async function clickClientLink(page: Page, href: string): Promise<void> {
  await navigateClient(page, async () => {
    await page.evaluate((destination) => {
      document.getElementById('locale-fallback-navigation-link')?.remove();
      const link = document.createElement('a');
      link.id = 'locale-fallback-navigation-link';
      link.href = destination;
      link.textContent = 'Navigate';
      link.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
      document.body.append(link);
    }, href);
    await page.locator('#locale-fallback-navigation-link').click();
  });
}

async function navigateClient(page: Page, navigate: () => Promise<unknown>): Promise<void> {
  await page.evaluate(() => {
    Reflect.set(window, '__localeFallbackPageLoaded', false);
    document.addEventListener(
      'astro:page-load',
      () => Reflect.set(window, '__localeFallbackPageLoaded', true),
      { once: true }
    );
  });
  await navigate();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__localeFallbackPageLoaded')), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  // The sentinel only survives client-side navigation, not a full reload.
  expect(await page.evaluate(() => Reflect.get(window, '__localeFallbackSession'))).toBe(true);
}

test('untranslated locale page shows localized chrome and the untranslated notice', async ({
  page,
}) => {
  const dictionaryRequest = page.waitForRequest(/\/locale-fallback\/de\.json\?v=[0-9a-f]{12}$/);
  await page.goto(untranslatedPath);
  await dictionaryRequest;

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

test('untranslated locale page localizes tooltips and the language of icon-only controls', async ({
  page,
}) => {
  await page.goto(untranslatedPath);
  await expect(page.getByText(untranslatedNotice)).toBeVisible();

  // `tooltips.ts` may have moved the English title into Tippy before the dictionary arrived.
  const topicLink = page.locator('.starlight-sidebar-topics a', { hasText: 'Grundlagen' }).first();
  await expect
    .poll(() =>
      topicLink.evaluate((element) => {
        const tooltip = (element as Element & { _tippy?: { props: { content: unknown } } })._tippy;
        return tooltip ? tooltip.props.content : element.getAttribute('title');
      })
    )
    .toBe('Grundlagen');

  const darkTheme = page.locator('#footer-theme-toggle [data-theme-option="dark"]');
  await expect(darkTheme).toHaveAttribute('aria-label', 'Dunkel');
  await expect(darkTheme).toHaveAttribute('lang', 'de');
});

test('untranslated locale page localizes the search UI and searches the English index', async ({
  page,
}) => {
  await page.goto(untranslatedPath);
  await dismissCookieConsentIfVisible(page);
  await expect(page.getByText(untranslatedNotice)).toBeVisible();

  const openButton = page.locator('site-search button[data-open-modal]');
  await expect(openButton).toBeVisible({ timeout: 15000 });
  await openButton.click();
  const dialog = page.locator('site-search dialog[open]');
  const input = dialog.locator('input.pagefind-ui__search-input');
  const devWarning = dialog.locator('text=/Search is only available in production builds/i');
  await expect(input.or(devWarning)).toBeVisible({ timeout: 15000 });
  test.skip(!(await input.isVisible()), 'Pagefind is only built for production.');

  // Pagefind initializes lazily, after the dictionary localized its strings.
  await expect(input).toHaveAttribute('placeholder', 'Suchen');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await input.fill('"zzzznonexistentcatalogquery"');
  await expect(dialog.locator('.pagefind-ui__message')).toContainText('Keine Ergebnisse für');

  await input.fill('install');
  const firstResult = dialog.locator('.pagefind-ui__result-link').first();
  await expect(firstResult).toBeVisible({ timeout: 15000 });
  await expect(firstResult).toHaveAttribute('href', /^\/(?!de\/)/);
  await expect(dialog.locator('.pagefind-ui__message')).toContainText('Ergebnis');
});

test('client navigation keeps fallback pages localized across history and back to English', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const japaneseNotice = 'このコンテンツはまだ日本語訳がありません。';
  const notices = page.locator('.locale-fallback-notice');
  const html = page.locator('html');
  const languageSelect = page.locator('#footer-language-select');

  const expectFallbackPage = async (path: string) => {
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('data-locale-fallback', 'ja');
    await expect(notices).toHaveCount(1);
    await expect(notices).toContainText(japaneseNotice);
    await expect(page.locator('nav.sidebar')).toContainText('基礎');
    await expect(page.locator('.pagination-links a').first()).toHaveAttribute('href', /^\/ja\//);
    await expect(languageSelect).toHaveValue('ja');
  };

  await page.goto('/ja/get-started/install-cli/');
  await dismissCookieConsentIfVisible(page);
  await page.evaluate(() => Reflect.set(window, '__localeFallbackSession', true));
  await expect(html).toHaveAttribute('lang', 'ja');
  await expect(languageSelect).toHaveValue('ja');

  await clickClientLink(page, '/ja/get-started/aspire-sdk/');
  await expectFallbackPage('/ja/get-started/aspire-sdk/');

  await clickClientLink(page, '/ja/get-started/dev-containers/');
  await expectFallbackPage('/ja/get-started/dev-containers/');

  await navigateClient(page, () => page.goBack());
  await expectFallbackPage('/ja/get-started/aspire-sdk/');

  await clickClientLink(page, '/get-started/install-cli/');
  await expect(page).toHaveURL(/\/get-started\/install-cli\/$/);
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).not.toHaveAttribute('data-locale-fallback', /.*/);
  await expect(notices).toHaveCount(0);
  await expect(page.locator('nav.sidebar')).toContainText('Foundations');
  await expect(page.locator('nav.sidebar')).not.toContainText('基礎');
  await expect(page.locator('.pagination-links a').first()).toHaveAttribute('href', /^\/(?!ja\/)/);
  await expect(languageSelect).toHaveValue('en');
});
