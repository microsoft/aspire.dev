import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible, waitForAccessibilityEnhancements } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.addInitScript(() => {
    localStorage.setItem('starlight-theme', 'light');
    localStorage.setItem(
      'aspire-preferred-locale',
      location.pathname.match(/^\/(de|ja)\//)?.[1] ?? 'en'
    );
  });
  await page.route(
    /https:\/\/(?:www\.youtube-nocookie\.com\/embed\/|player\.twitch\.tv\/)/,
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en"><title>Player</title><body></body></html>',
      })
  );
});

async function open(page: Page, path: string) {
  await page.goto(path);
  await dismissCookieConsentIfVisible(page);
  await expect(page.locator('main h1:visible, h1:visible').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function expectReflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function expectTouchTarget(control: Locator) {
  const bounds = await control.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(34);
  expect(bounds!.height).toBeGreaterThanOrEqual(34);
}

const pageFamilies = [
  '/',
  '/docs/',
  '/get-started/first-app/',
  '/get-started/install-cli/',
  '/reference/cli/commands/aspire-run/',
  '/integrations/',
  '/integrations/gallery/',
  '/integrations/caching/redis/',
  '/dashboard/',
  '/deployment/',
  '/community/',
  '/community/videos/',
  '/community/contributors/',
  '/community/thanks/',
  '/aspireconf/',
  '/reference/samples/',
  '/reference/samples/aspire-shop/',
  '/reference/container-images/',
  '/hub/',
  '/hub/browse/',
  '/hub/glossary/',
  '/hub/glossary/resourcenotificationservice/',
  '/whats-new/aspire-13-6/',
  '/i18n/',
  '/404/',
  '/de/get-started/first-app/',
  '/ja/get-started/first-app/',
  '/reference/api/csharp/',
  '/reference/api/csharp/aspire.hosting.redis/',
  '/reference/api/csharp/aspire.hosting.redis/redisresource/',
  '/reference/api/csharp/aspire.hosting.redis/redisbuilderextensions/methods/',
  '/reference/api/typescript/',
  '/reference/api/typescript/aspire.hosting.redis/',
  '/reference/api/typescript/aspire.hosting.redis/redisresource/',
  '/reference/api/typescript/aspire.hosting.redis/redisresource/withmodule/',
];

test('all page families stay within their phone, tablet and desktop viewport', async ({ page }) => {
  test.setTimeout(300_000);
  for (const path of pageFamilies) {
    await open(page, path);
    await expectReflow(page);
  }
});

test('phone toolbar keeps primary actions and consistent icon geometry', async ({
  page,
}, testInfo) => {
  test.slow();
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'Explicit reflow widths are covered once.'
  );
  for (const path of [
    '/',
    '/get-started/install-cli/',
    '/hub/',
    '/aspireconf/',
    '/reference/api/csharp/',
  ]) {
    await open(page, path);
    for (const width of [320, 360, 390, 430, 799]) {
      await page.setViewportSize({ width, height: 844 });
      const header = page.getByRole('banner');
      const menu = page.locator('starlight-menu-button button');
      await expect(menu).toHaveCount(1);
      await expectTouchTarget(menu);
      await expectTouchTarget(header.getByRole('link', { name: 'Aspire', exact: true }));
      await expectTouchTarget(header.getByRole('link', { name: 'Try Aspire', exact: true }));
      if (path.startsWith('/reference/api/')) {
        await expect(header.locator('site-search')).toHaveCount(0);
      } else {
        await expectTouchTarget(header.getByRole('button', { name: /^Search/ }));
        expect((await header.locator('site-search svg').boundingBox())!.width).toBe(18);
      }
      expect((await menu.locator('.open-menu').boundingBox())!.width).toBe(18);
      await expect(header.locator('.title-wrapper .sl-badge')).toBeHidden();
      await expect(header.locator('.right-group-mobile a')).toHaveCount(1);
      await expectReflow(page);
    }
  }
});

test('shared menus announce state, keep filters usable and restore focus after navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/hub/', '/get-started/install-cli/', '/reference/api/typescript/']) {
    await open(page, path);
    const menu = page.locator('starlight-menu-button button');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.main-frame')).toHaveAttribute('inert', '');
    const panel = page.locator('#starlight__sidebar');
    await expect(panel.locator('.mobile-site-links a[href="/docs/"]')).toBeVisible();
    await expect(panel.locator('.mobile-site-links a[href="/hub/"]')).toBeVisible();
    await expect(panel.locator('.mobile-site-links a[href="/community/videos/"]')).toBeVisible();
    await expectTouchTarget(panel.locator('.mobile-site-links a').first());
    if (path === '/get-started/install-cli/') {
      await panel.locator('#sidebar-filter-input').fill('first');
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await panel.locator('#sidebar-filter-input').fill('');
      await panel.locator('summary').first().click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
    }
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
    await expect(page.locator('.main-frame')).not.toHaveAttribute('inert', '');
  }
  await page.evaluate(() => Reflect.set(window, '__mobileUxNavigation', true));
  await page.locator('starlight-menu-button button').click();
  await page.locator('.mobile-site-links a[href="/docs/"]').click();
  await expect(page).toHaveURL(/\/docs\/$/);
  await waitForAccessibilityEnhancements(page);
  expect(await page.evaluate(() => Reflect.get(window, '__mobileUxNavigation'))).toBe(true);
  const returnedMenu = page.locator('starlight-menu-button button');
  await returnedMenu.click();
  await expect(returnedMenu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(returnedMenu).toHaveAttribute('aria-expanded', 'false');
});

test('environment badges remain visible on desktop and hide only in compact headers', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'Explicit desktop and phone widths are covered once.'
  );
  for (const path of ['/', '/get-started/install-cli/', '/reference/api/csharp/']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, path);
    // Public production builds omit the label; use the same badge markup to exercise its CSS.
    await page.locator('header .title-wrapper').evaluate((wrapper) => {
      if (wrapper.querySelector('.sl-badge')) return;
      const badge = document.createElement('span');
      badge.className = 'sl-badge tip small';
      badge.textContent = 'staging';
      wrapper.classList.add('has-environment-badge');
      wrapper.append(badge);
    });
    const badge = page.locator('header .title-wrapper .sl-badge');
    for (const width of [1440, 1024, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width >= 800) await expect(badge).toBeVisible();
      else await expect(badge).toBeHidden();
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await expect(page.locator('html')).toHaveAttribute('data-mobile-layout', '');
    await expect(badge).toBeHidden();
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await expect(badge).toBeVisible();
  }
});

test('announcement links remain text links with a separate dismiss column', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Explicit banner sizes are covered once.');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await open(page, '/');
    const banner = page.locator('[data-aspire-banner]');
    await expect(banner).toBeVisible();
    const content = (await banner.locator('.sl-banner__content').boundingBox())!;
    const dismiss = (await banner.locator('[data-dismiss-banner]').boundingBox())!;
    expect(content.x + content.width).toBeLessThanOrEqual(dismiss.x - 8);
    expect(dismiss.x + dismiss.width).toBeLessThanOrEqual(width);
    const link = banner.getByRole('link');
    await expect(link).toHaveCSS('border-top-width', '0px');
    await expect(link).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(link).toHaveCSS('text-decoration-line', 'underline');
    await expectReflow(page);
  }
  const dismiss = page.locator('[data-dismiss-banner]');
  await dismiss.click();
  await expect(page.locator('[data-aspire-banner]')).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-aspire-banner]')).toBeHidden();
});

test('secondary controls match the compact TOC and code-copy glyphs do not stretch', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await open(page, '/reference/cli/commands/aspire-run/');
    const reference = (await page.locator('mobile-starlight-toc .toggle').boundingBox())!.height;
    expect(reference).toBe(34);
    for (const control of [
      page.locator('starlight-menu-button button'),
      page.locator('.try-aspire-btn-mobile'),
      page.locator('site-search button[data-open-modal]'),
      ...await page.locator('.actions-container .action-button:visible').all(),
      page.locator('.expressive-code .copy button:visible').first(),
    ]) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(reference);
      expect(bounds.height).toBeLessThanOrEqual(reference + 2);
    }
    for (const button of await page.locator('.actions-container .action-button:visible').all()) {
      const padding = await button.evaluate((element) => ({
        left: Number.parseFloat(getComputedStyle(element).paddingLeft),
        right: Number.parseFloat(getComputedStyle(element).paddingRight),
      }));
      expect(padding.left).toBe(12);
      expect(padding.right).toBe(12);
    }
    const actionBlock = (await page.locator('.actions-container').boundingBox())!;
    expect(actionBlock.height).toBeLessThanOrEqual(width === 320 ? reference * 2 + 6 : reference + 2);
    const glyph = (await page.locator('.expressive-code .copy button:visible > div').first().boundingBox())!;
    expect(glyph.width).toBe(16);
    expect(glyph.height).toBe(16);
  }
});

test('technical titles and breadcrumbs wrap whole identifier segments', async ({ page }) => {
  for (const [path, title] of [
    ['/hub/glossary/resourcenotificationservice/', 'ResourceNotificationService'],
    ['/reference/api/csharp/aspire.hosting.redis/redisbuilderextensions/methods/', 'RedisBuilderExtensions Methods'],
    ['/reference/api/typescript/aspire.hosting.redis/redisresource/withmodule/', 'RedisResource.withModule'],
  ]) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, path);
      const heading = page.locator('h1#_top');
      await expect(heading).toHaveText(title);
      expect(await heading.locator('wbr').count()).toBeGreaterThan(0);
      const fragmented = await heading.evaluate((element) =>
        [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE && /^[A-Za-z.]+$/.test(node.textContent?.trim() ?? ''))
          .filter((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.y))).size > 1;
          })
          .map((node) => node.textContent)
      );
      expect(fragmented, `${title} at ${width}px`).toEqual([]);
      await expectReflow(page);
    }
  }
});

test('breadcrumbs show one complete trail with obvious ancestor links and a plain current page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, '/reference/api/csharp/aspire.hosting.redis/redisresource/');
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  const parent = breadcrumb.locator('.bc-parent');
  await expect(parent).toHaveAttribute('href', '/reference/api/csharp/aspire.hosting.redis/');
  await expectTouchTarget(parent);
  const trail = breadcrumb.locator('ol');
  await expect(trail).toBeVisible();
  await expect(trail.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(trail.locator('[aria-current="page"]')).toHaveText('RedisResource');
  await expect(breadcrumb.locator('summary, button, select')).toHaveCount(0);
  await expect(breadcrumb.getByRole('link', { name: 'Aspire.Hosting.Redis', exact: true })).toHaveCount(1);
  for (const link of await trail.getByRole('link').all()) {
    await expectTouchTarget(link);
    await expect(link).toHaveCSS('text-decoration-line', 'underline');
  }
  await expectReflow(page);
});

test('integration-card code borders match their surrounding light-theme controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/integrations/gallery/');
  const card = page.locator('.card').first();
  const border = await card.evaluate((element) => getComputedStyle(element).borderTopColor);
  await expect(card.locator('pre').first()).toHaveCSS('border-top-color', border);
  await expect(card.locator('.lang-button').first()).toHaveCSS('border-top-color', border);
});

test('page actions have unique panels, keyboard dismissal and bounded positioning', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of ['/get-started/install-cli/', '/hub/glossary/apphost/']) {
    await open(page, path);
    for (const name of ['Open', 'Share']) {
      const button = page.locator('.actions-container').getByRole('button', { name, exact: true });
      await expectTouchTarget(button);
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      const id = await button.getAttribute('aria-controls');
      const panel = page.locator(`[id="${id}"]`);
      await expect(panel).toHaveCount(1);
      await expect(panel).toBeVisible();
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(568);
      await panel.getByRole('link').first().focus();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button).toBeFocused();
    }
  }
});

test('Markdown copying binds once after repeated client navigation and reports failed requests', async ({ page }) => {
  const copies: string[] = [];
  await page.exposeFunction('__captureMobileMarkdown', (text: string) => copies.push(text));
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: (text: string) => Reflect.get(window, '__captureMobileMarkdown')(text),
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/reference/api/csharp/aspire.hosting.redis/redisresource/');
  const source = '/reference/api/csharp/aspire.hosting.redis/redisresource.md';
  await page.route(`**${source}`, (route) => route.fulfill({ contentType: 'text/markdown', body: '# RedisResource' }));
  for (let visit = 0; visit < 2; visit++) {
    const copy = page.locator('[data-page-action="copy-markdown"]');
    await copy.click();
    await expect(copy).toHaveClass(/copied/);
    expect(copies).toHaveLength(visit + 1);
    await page.locator('.bc-parent').click();
    await expect(page).toHaveURL(/\/aspire\.hosting\.redis\/$/, { timeout: 30_000 });
    await page.locator('#pkg-search-input').fill('RedisResource');
    await page.locator('#pkg-search-results a[href="/reference/api/csharp/aspire.hosting.redis/redisresource/"]').first().click();
    await expect(page).toHaveURL(/\/redisresource\/$/, { timeout: 30_000 });
    await waitForAccessibilityEnhancements(page);
  }
  await page.unroute(`**${source}`);
  await page.route(`**${source}`, (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  const copy = page.locator('[data-page-action="copy-markdown"]');
  await copy.click();
  await expect(copy).toHaveClass(/error/);
  expect(copies).toHaveLength(2);
});

test('sample disclosure removes hidden tags from keyboard navigation without losing selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, '/reference/samples/');
  const tags = page.locator('[data-tag-filters] .tag-chip');
  const toggle = page.locator('[data-tag-toggle]');
  await expect(tags.filter({ visible: true })).toHaveCount(8);
  await tags.nth(7).focus();
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await expect(tags.filter({ visible: true })).toHaveCount(await tags.count());
  const hiddenTag = tags.nth(12);
  const slug = (await hiddenTag.getAttribute('data-tag'))!;
  await hiddenTag.click();
  await expect(hiddenTag).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL((url) =>
    (url.searchParams.get('tags') ?? '').split(',').includes(slug)
  );
  await page.reload();
  await expect(hiddenTag).toBeVisible();
  await expect(hiddenTag).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expectTouchTarget(hiddenTag);
});

test('API identifiers and the translation table reflow without clipping content', async ({
  page,
}) => {
  for (const path of [
    '/reference/api/csharp/aspire.hosting.redis/redisresource/',
    '/reference/api/csharp/aspire.hosting.redis/redisbuilderextensions/methods/',
    '/reference/api/typescript/aspire.hosting.redis/redisresource/',
  ]) {
    await open(page, path);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await expectReflow(page);
      const clipped = await page
        .locator('.mol-name, .mc-name, .polyglot-note code')
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element.scrollWidth > element.clientWidth + 1 &&
                getComputedStyle(element).display !== 'inline'
            )
            .map((element) => element.textContent)
        );
      expect(clipped, path).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, '/i18n/');
  await expectReflow(page);
  const region = page.getByRole('region', { name: 'Translation status by file' });
  await region.focus();
  await expect(region).toBeFocused();
  await expect(region.locator('table')).toBeVisible();
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await region.press('ArrowRight');
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test('mobile controls and content remain accessible in both settled themes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    '/deployment/',
    '/aspireconf/',
    '/community/',
    '/de/get-started/first-app/',
    '/reference/api/csharp/aspire.hosting.redis/redisbuilderextensions/methods/',
  ]) {
    await open(page, path);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      await page.waitForFunction(
        () =>
          !document
            .getAnimations()
            .some(
              (animation) =>
                animation.playState === 'running' &&
                animation.effect?.getTiming().iterations !== Infinity
            )
      );
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .options({ iframes: false })
        .analyze();
      expect(
        results.violations.map(({ id, nodes }) => ({
          id,
          nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
        })),
        `${path} ${theme}`
      ).toEqual([]);
    }
  }
});

test('reading and navigation tolerate doubled text, spacing, landscape and forced colors', async ({
  page,
}) => {
  for (const path of ['/get-started/first-app/', '/hub/browse/', '/reference/samples/']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, path);
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await page.addStyleTag({
      content:
        '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
    });
    await expectReflow(page);
    await expectTouchTarget(page.locator('starlight-menu-button button'));
    await page.setViewportSize({ width: 844, height: 390 });
    await expectReflow(page);
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    const menu = page.locator('starlight-menu-button button');
    if (await menu.isVisible()) {
      await menu.focus();
      await expect(menu).toHaveCSS('outline-style', 'solid');
    }
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
  }
});
