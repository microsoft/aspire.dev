import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

// Cover native transitions on desktop and ClientRouter's swap fallback on touch
// projects. Both must preserve the same JavaScript context across navigation.
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

type Language = 'csharp' | 'typescript';
const packagePath = (language: Language) => `/reference/api/${language}/aspire.hosting.redis/`;
const typePath = (language: Language) => `${packagePath(language)}redisresource/`;
const rootSelector = '[data-api-search-language][data-api-search-kind]';

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function markClientSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    Reflect.set(window, '__apiNavigationSession', true);
  });
}

async function clickClientLink(page: Page, link: Locator): Promise<void> {
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
  const destination = new URL(href!, page.url()).href;
  await page.evaluate(() => {
    Reflect.set(window, '__apiNavigationLoaded', false);
    document.addEventListener('astro:page-load', () => {
      Reflect.set(window, '__apiNavigationLoaded', true);
    }, { once: true });
  });
  await link.click();
  await expect(page).toHaveURL(destination);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__apiNavigationLoaded'))).toBe(true);
  // page-load precedes the visual transition finishing. Wait before scrolling,
  // searching, or tapping again so touch navigation doesn't abort its capture.
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  // A hard reload would erase this marker and hide the persistent-controller bug.
  expect(await page.evaluate(() => Reflect.get(window, '__apiNavigationSession'))).toBe(true);
}

async function navigateClient(page: Page, href: string): Promise<void> {
  // Package/type pages don't link directly to their other-language counterparts.
  // Use a real anchor through Astro's router, never page.goto for these transitions.
  await page.evaluate((destination) => {
    document.getElementById('api-navigation-test-link')?.remove();
    const link = document.createElement('a');
    link.id = 'api-navigation-test-link';
    link.href = destination;
    link.textContent = 'Navigate to API test destination';
    link.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;background:white;color:black';
    document.body.appendChild(link);
  }, href);
  await clickClientLink(page, page.locator('#api-navigation-test-link'));
}

async function expectLanguageResults(page: Page, prefix: string, language: Language): Promise<Locator> {
  const results = page.locator(`#${prefix}-search-results .api-search-result`);
  await expect(results.first()).toBeVisible();
  const destinations = await results.evaluateAll((elements) =>
    elements.map((element) => ({ tag: element.tagName, href: element.getAttribute('href') })),
  );
  expect(destinations.length).toBeGreaterThan(0);
  for (const result of destinations) {
    expect(result.tag).toBe('A');
    expect(result.href).toMatch(new RegExp(`^/reference/api/${language}/`));
  }
  return results;
}

for (const firstLanguage of ['csharp', 'typescript'] as const) {
  test(`API package, type and member links survive ${firstLanguage}-first cross-language navigation`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = trackPageErrors(page);
    const otherLanguage = firstLanguage === 'csharp' ? 'typescript' : 'csharp';
    await page.goto(packagePath(firstLanguage));
    await dismissCookieConsentIfVisible(page);
    await markClientSession(page);

    for (const language of [firstLanguage, otherLanguage, firstLanguage] as const) {
      if (new URL(page.url()).pathname !== packagePath(language)) {
        await navigateClient(page, packagePath(language));
      }
      await expect(page.locator(rootSelector)).toHaveAttribute('data-api-search-language', language);
      await page.locator('#pkg-search-input').fill('RedisResource');
      const types = await expectLanguageResults(page, 'pkg', language);
      await expect(types.first().locator('.api-search-result-name')).toHaveText('RedisResource');
      await expect(types.first()).toHaveAttribute('href', typePath(language));
      await expect(page).toHaveURL(/q=RedisResource/);
      await clickClientLink(page, types.first());

      await expect(page.locator(rootSelector)).toHaveAttribute('data-api-search-kind', language === 'csharp' ? 'type' : 'item');
      await page.locator('#type-search-input').fill('host');
      const member = page.locator('#type-search-results a.api-search-result').first();
      await expect(member).toHaveAttribute('href', '#host');
      await member.click();
      await expect(page).toHaveURL(/#host$/);
      await expect(page.locator('#host')).toHaveClass(/search-highlight/);

      const detailLink = language === 'csharp'
        ? page.locator('#host a.mol-name-link')
        : page.locator(`#type-content-sections a[href="${typePath(language)}withmodule/"]`);
      await clickClientLink(page, detailLink);
      await expect(page.locator(rootSelector)).toHaveCount(0);
      await navigateClient(page, packagePath(language));
      const query = language === 'csharp' ? 'WithHostPort' : 'withModule';
      await page.locator('#pkg-search-input').fill(query);
      const members = await expectLanguageResults(page, 'pkg', language);
      await expect(members.first()).toHaveAttribute('href', language === 'csharp'
        ? /\/redisbuilderextensions\/methods\/#withhostport/
        : /\/aspire.hosting.redis\/withmodule\/$/);
      await clickClientLink(page, members.first());
      await expect(page.locator(rootSelector)).toHaveCount(0);
      await expect(page.locator('main h1')).toBeVisible();
      await navigateClient(page, packagePath(language));
    }
    expect(errors).toEqual([]);
  });
}

test('API landing searches and query filters survive language changes and history navigation', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackPageErrors(page);
  const query = '?q=RedisResource&keep=1';
  await page.goto(`/reference/api/csharp/${query}`);
  await dismissCookieConsentIfVisible(page);
  await markClientSession(page);

  for (const language of ['csharp', 'typescript', 'csharp'] as const) {
    const landing = `/reference/api/${language}/${query}`;
    if (new URL(page.url()).pathname !== `/reference/api/${language}/`) {
      await navigateClient(page, landing);
    }
    const prefix = language === 'csharp' ? 'api' : 'ts-api';
    await expect(page.locator(`#${prefix}-search-input`)).toHaveValue('RedisResource');
    const results = await expectLanguageResults(page, prefix, language);
    await clickClientLink(page, results.first());
    await expect(page.locator('#type-search-input')).toBeVisible();
    await page.goBack();
    await expect(page.locator(`#${prefix}-search-input`)).toHaveValue('RedisResource');
    await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
    await expectLanguageResults(page, prefix, language);
    expect(new URL(page.url()).searchParams.get('keep')).toBe('1');
    expect(await page.evaluate(() => Reflect.get(window, '__apiNavigationSession'))).toBe(true);

    const kind = language === 'csharp' ? 'class' : 'handle';
    const chip = page.locator(`#${prefix}-kind-filters [data-kind="${kind}"]`);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).searchParams.get('kinds')).toBe(kind);
    await page.locator(`#${prefix}-search-clear`).click();
    await expect(page.locator(`#${prefix}-search-input`)).toHaveValue('');
    await page.locator(`#${prefix}-clear-filters`).click();
    await expect(page.locator(`#${prefix}-package-list`)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('keep')).toBe('1');
    await clickClientLink(page, page.locator(`#${prefix}-package-list a[href="${packagePath(language)}"]`));
    await expect(page.locator('#pkg-search-input')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('all six API search surfaces cancel pending input when leaving, including non-API destinations', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackPageErrors(page);
  const surfaces = [
    { path: '/reference/api/csharp/', prefix: 'api' },
    { path: packagePath('csharp'), prefix: 'pkg' },
    { path: typePath('csharp'), prefix: 'type' },
    { path: typePath('typescript'), prefix: 'type' },
    { path: packagePath('typescript'), prefix: 'pkg' },
    { path: '/reference/api/typescript/', prefix: 'ts-api' },
  ];
  await page.goto(surfaces[0].path);
  await dismissCookieConsentIfVisible(page);
  await markClientSession(page);

  for (const [index, surface] of surfaces.entries()) {
    await expect(page.locator(`#${surface.prefix}-search-input`)).toBeVisible();
    // Queue input immediately before the real swap. This deterministically leaves
    // a debounce pending without relying on network speed beating a 200ms timer.
    await page.evaluate((prefix) => {
      const input = document.querySelector<HTMLInputElement>(`#${prefix}-search-input`)!;
      document.addEventListener('astro:before-swap', () => {
        input.value = 'stale-query-from-departed-page';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, { capture: true, once: true });
    }, surface.prefix);
    const next = surfaces[index + 1];
    const destination = `${next?.path ?? '/reference/overview/'}?keep=1`;
    await navigateClient(page, destination);
    // A negative timer assertion must observe beyond the longest search debounce.
    await page.waitForTimeout(350);
    await expect(page).toHaveURL(new URL(destination, page.url()).href);
    if (!next) await expect(page.locator(rootSelector)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
