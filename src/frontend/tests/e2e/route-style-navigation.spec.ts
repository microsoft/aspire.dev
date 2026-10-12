import { expect, test, type Page } from '@playwright/test';

const home = '/';
const docs = '/docs/';
const api = (language: string) => `/reference/api/${language}/`;
const redis = (language: string) => `${api(language)}aspire.hosting.redis/redisresource/`;
const routes = [home, docs, api('csharp'), api('typescript'), redis('csharp'), redis('typescript')];

async function markNavigation(page: Page) {
  await page.evaluate(() => {
    Reflect.set(window, '__routeStyleLoaded', false);
    document.addEventListener(
      'astro:page-load',
      () => {
        Reflect.set(window, '__routeStyleLoaded', true);
      },
      { once: true }
    );
  });
}

async function settled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__routeStyleLoaded')), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(page.locator('html[data-astro-transition]')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__routeStyleSession'))).toBe(true);
}

async function navigate(page: Page, href: string) {
  await markNavigation(page);
  await page.evaluate((destination) => {
    const anchor = document.createElement('a');
    anchor.id = 'route-style-link';
    anchor.href = destination;
    anchor.textContent = 'Navigate';
    anchor.style.cssText = 'position:fixed;top:80px;left:0;z-index:2147483647';
    document.body.append(anchor);
  }, href);
  await page.locator('#route-style-link').click({ force: true });
  const destination = new URL(href, page.url());
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === destination.pathname &&
      [...destination.searchParams].every(([key, value]) => url.searchParams.get(key) === value),
    { timeout: 30_000 }
  );
  await settled(page);
}

async function appearance(page: Page) {
  await expect(page.locator('main h1')).toHaveCount(1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  return page.evaluate(async () => {
    const selectors = [
      'html',
      'body',
      'header.header',
      'header .header',
      'header .title-wrapper',
      'header .right-group',
      'header .right-group-mobile',
      'main h1',
      'main > .content-panel',
      '.sl-markdown-content',
      '.home-hero-story',
      '.home-hero-sticky',
      '.home-hero-copy',
      '.home-hero-summary',
      '.home-hero-actions',
      '.home-hero-product',
      '.api-hero',
      '.api-hero-summary',
      '.api-search-input',
      '.api-kind-badge',
      '.topics-sidebar',
    ];
    const properties = [
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'color',
      'background-color',
      'display',
      'position',
      'padding',
      'margin-top',
      'margin-bottom',
      'width',
      'max-width',
      'grid-template-columns',
      'gap',
      'overflow-x',
      'word-break',
      'overflow-wrap',
    ];
    const styles = Object.fromEntries(
      selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return [selector, null];
        element.getBoundingClientRect();
        const computed = getComputedStyle(element);
        return [
          selector,
          Object.fromEntries(
            properties.map((property) => [property, computed.getPropertyValue(property)])
          ),
        ];
      })
    );
    const root = document.documentElement;
    const rootAttributes = Object.fromEntries(
      [
        'lang',
        'dir',
        'data-theme',
        'data-has-sidebar',
        'data-has-hero',
        'data-apphost-lang',
        'data-home-js',
        'data-aspire-environment-state',
        'data-sidebar-collapsed',
        'data-topic-sidebar-collapsed',
        'data-api-sidebar-ready',
        'data-topic-sidebar-ready',
      ].map((name) => [name, root.getAttribute(name)])
    );
    return {
      styles,
      rootAttributes,
      rootClass: root.className,
      stylesheets: Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'), (link) =>
        link.getAttribute('href')
      ).sort(),
      bodyClass: document.body.className,
      bodyStyle: document.body.getAttribute('style'),
      apiTitle: document.querySelector('main h1')?.classList.contains('api-page-title'),
      searchCount: document.querySelectorAll('site-search').length,
      actionsCount: document.querySelectorAll('.actions-container').length,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
      titleCount: document.head.querySelectorAll('title').length,
    };
  });
}

for (const theme of ['light', 'dark']) {
  test.describe(`${theme} route styles`, () => {
    test.beforeEach(async ({ page, isMobile }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.route('**/scripts/analytics/*.js', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: '' })
      );
      await page.route('**/wcp-consent.js', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: '' })
      );
      await page.addInitScript(
        ({ theme, fallback }) => {
          localStorage.setItem('starlight-theme', theme);
          localStorage.setItem('aspireConsentRequired', 'false');
          if (fallback)
            Object.defineProperty(document, 'startViewTransition', {
              configurable: true,
              value: undefined,
            });
        },
        { theme, fallback: isMobile }
      );
    });

    test('fresh rendering matches API/search/Home, docs/Home, cross-language and history swaps', async ({
      page,
    }) => {
      test.setTimeout(180000);
      const baseline = new Map<string, Awaited<ReturnType<typeof appearance>>>();
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        baseline.set(route, await appearance(page));
      }
      const matchesFresh = async (route: string) => {
        await expect
          .poll(() => appearance(page), {
            message: `${route} must match its fresh ${theme} rendering after a client swap`,
          })
          .toEqual(baseline.get(route));
      };
      await page.goto(api('csharp'));
      await page.evaluate(() => Reflect.set(window, '__routeStyleSession', true));
      await page.locator('#api-search-input').fill('RedisResource');
      const result = page.locator(`#api-search-results a[href="${redis('csharp')}"]`).first();
      await expect(result).toBeVisible();
      await markNavigation(page);
      await result.click();
      await settled(page);
      await matchesFresh(redis('csharp'));
      await navigate(page, home);
      await matchesFresh(home);
      for (const route of [
        docs,
        home,
        api('csharp'),
        api('typescript'),
        redis('typescript'),
        redis('csharp'),
        home,
      ]) {
        await navigate(page, route);
        await matchesFresh(route);
      }
      await markNavigation(page);
      await page.goBack();
      await settled(page);
      await matchesFresh(redis('csharp'));
      await markNavigation(page);
      await page.goForward();
      await settled(page);
      await matchesFresh(home);
    });

    test('restores saved language and route-specific collapsed sidebars, with URL language taking precedence', async ({
      page,
    }) => {
      test.setTimeout(120000);
      await page.addInitScript(() => {
        localStorage.setItem('aspire-lang', 'csharp');
        localStorage.setItem('api-sidebar-collapsed', '1');
        localStorage.setItem('topic-sidebar-collapsed', '1');
      });
      await page.goto(api('csharp'));
      await expect(page.locator('html')).toHaveAttribute('data-sidebar-collapsed', '');
      await page.evaluate(() => Reflect.set(window, '__routeStyleSession', true));
      for (const route of [home, '/get-started/app-host/', api('typescript'), api('csharp')]) {
        await navigate(page, route);
        const isApi = route.startsWith('/reference/api/');
        const isDoc = route === '/get-started/app-host/';
        await expect(page.locator('html')).toHaveAttribute('data-apphost-lang', 'csharp');
        await expect(page.locator('html[data-sidebar-collapsed]')).toHaveCount(isApi ? 1 : 0);
        await expect(page.locator('html[data-topic-sidebar-collapsed]')).toHaveCount(isDoc ? 1 : 0);
        if (isApi || isDoc) {
          const prefix = isApi ? 'sidebar' : 'topic-sidebar';
          await expect(page.locator(`#${prefix}-expand-btn`)).toHaveAttribute(
            'aria-expanded',
            'false'
          );
          await expect(page.locator(`#${prefix}-collapse-btn`)).toHaveAttribute(
            'aria-hidden',
            'true'
          );
        }
      }
      await navigate(page, '/get-started/app-host/?aspire-lang=typescript');
      await expect(page.locator('html')).toHaveAttribute('data-apphost-lang', 'typescript');
      await navigate(page, home);
      await expect(page.locator('html')).toHaveAttribute('data-apphost-lang', 'typescript');
    });

    test('header install affordance retains responsive visibility and dialog layout after swaps', async ({
      page,
      isMobile,
    }) => {
      test.setTimeout(120000);
      await page.goto(home);
      await page.evaluate(() => Reflect.set(window, '__routeStyleSession', true));
      const dialog = page.locator('#install-cli-modal');
      const trigger = page.locator('header [data-open-install-modal]:visible');
      if (page.viewportSize()!.width < 800) {
        // The compact header intentionally omits the install action.
        for (const route of [api('csharp'), docs, home]) {
          await expect(trigger).toHaveCount(0);
          await expect(dialog).not.toBeVisible();
          await navigate(page, route);
        }
        await expect(trigger).toHaveCount(0);
        return;
      }
      const openAndMeasure = async () => {
        if (isMobile) await trigger.tap();
        else await trigger.click();
        await expect(page.locator('dialog[open]')).toHaveCount(1);
        await expect(dialog).toBeVisible();
        return dialog.evaluate((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            color: style.color,
            background: style.backgroundColor,
            font: style.font,
            width: rect.width,
            fits: rect.left >= 0 && rect.right <= window.innerWidth,
          };
        });
      };
      const baseline = await openAndMeasure();
      expect(baseline.fits).toBe(true);
      for (const route of [api('csharp'), docs, home]) {
        const close = dialog.getByRole('button', { name: 'Close modal', exact: true });
        if (isMobile) await close.tap();
        else await close.click();
        await expect(dialog).not.toBeVisible();
        await navigate(page, route);
        expect(await openAndMeasure()).toEqual(baseline);
      }
    });
  });
}
