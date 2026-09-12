import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dismissCookieConsentIfVisible } from './helpers';

const routes = [
  '/',
  '/dev/',
  '/dev/browse/',
  '/dev/glossary/',
  '/dev/glossary/apphost/',
  '/integrations/cloud/aws/overview/',
];

async function expectAccessible(page: Page, scope?: string) {
  let scan = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);
  if (scope) scan = scan.include(scope).include('header').include('footer');
  const result = await scan.analyze();
  expect(result.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  })), page.url()).toEqual([]);
}

for (const route of routes) {
  test(`new surfaces meet automated WCAG AA checks in both themes: ${route}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);
    await dismissCookieConsentIfVisible(page);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      if (route === '/') await page.locator('.home-closing').scrollIntoViewIfNeeded();
      // The article's inherited TOC target-size issue also reproduces on unchanged docs pages.
      const scope = route === '/' ? '.home-closing' : route.startsWith('/integrations/') ? 'main' : undefined;
      await expectAccessible(page, scope);
    }
  });

  test(`new surfaces retain content with increased text spacing and narrow reflow: ${route}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);
    await dismissCookieConsentIfVisible(page);
    await page.addStyleTag({ content: `
      * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
      p { margin-bottom: 2em !important; }
    ` });
    for (const width of [320, 720, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const scope = route === '/' ? '.home-closing' : 'main';
      const overflow = await page.locator(scope).evaluate((root) =>
        [...root.querySelectorAll<HTMLElement>('h1, h2, h3, p, button, summary, a')]
          // Heading permalink icons can overhang their boxes; they contain no visible text.
          .filter((el) => el.checkVisibility() && !el.closest('.sr-only, .sl-anchor-link, [aria-hidden="true"]'))
          .filter((el) => ['block', 'flex', 'inline-flex', 'grid'].includes(getComputedStyle(el).display))
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => ({ tag: el.tagName, text: el.textContent?.trim(), width: el.clientWidth, contentWidth: el.scrollWidth })),
      );
      expect(overflow, `${route} at ${width}px`).toEqual([]);
      if (route !== '/') {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  });
}

test('every glossary article has accessible content in both themes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The shared article template is covered on mobile separately.');
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/glossary/');
  await dismissCookieConsentIfVisible(page);
  const paths = await page.locator('[data-term-link]').evaluateAll((links) =>
    [...new Set(links.map((link) => new URL((link as HTMLAnchorElement).href).pathname))],
  );
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('main h1')).toHaveCount(1);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      await expectAccessible(page, '.term-reading');
    }
  }
});

test('new navigation keeps keyboard focus visible in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  for (const route of ['/dev/', '/dev/browse/', '/dev/glossary/', '/dev/glossary/apphost/']) {
    await page.goto(route);
    await dismissCookieConsentIfVisible(page);
    const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
    await skip.focus();
    await skip.press('Enter');
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let step = 0; step < 12; step++) {
        await page.keyboard.press(key);
        const focus = await page.evaluate(() => {
          const el = document.activeElement;
          if (!(el instanceof HTMLElement) || !el.closest('.dev-center')) return null;
          const box = el.getBoundingClientRect();
          const header = document.querySelector('header')!.getBoundingClientRect();
          return {
            text: el.getAttribute('aria-label') ?? el.textContent?.trim(),
            visible: box.width > 0 && box.height > 0 && box.bottom > header.bottom && box.top < innerHeight,
            outline: getComputedStyle(el).outlineStyle,
          };
        });
        if (focus) {
          expect(focus.visible, `${route}: ${focus.text}`).toBe(true);
          expect(focus.outline, `${route}: ${focus.text}`).toBe('solid');
        }
      }
    }
  }
});
