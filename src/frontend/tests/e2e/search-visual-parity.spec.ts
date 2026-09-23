import { expect, test, type Locator } from '@playwright/test';

async function expectBotLayout(empty: Locator) {
  const content = empty.locator('.search-empty-content');
  await expect(content).toBeVisible();
  const layout = await content.evaluate(async (element) => {
    const style = getComputedStyle(element);
    const url = style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    if (!url) throw new Error('Missing empty-state bot background');
    const image = new Image();
    image.src = url;
    await image.decode();
    const box = element.getBoundingClientRect();
    const panelElement = element.parentElement!;
    const panel = panelElement.getBoundingClientRect();
    const container = panelElement.parentElement!;
    const containerStyle = getComputedStyle(container);
    const containerLeft = container.getBoundingClientRect().left
      + parseFloat(containerStyle.borderLeftWidth) + parseFloat(containerStyle.paddingLeft);
    const artWidth = parseFloat(style.backgroundSize);
    const artHeight = artWidth * image.naturalHeight / image.naturalWidth;
    const artRight = box.right;
    const children = Array.from(element.children)
      .filter(child => child.getBoundingClientRect().width > 0);
    return {
      url,
      viewportWidth: window.innerWidth,
      artWidth,
      artHeight,
      verticalPadding: (panel.height - artHeight) / 2,
      panelWidth: panel.width,
      startOffset: Math.abs(panel.left - containerLeft),
      inlinePadding: (panel.width - box.width) / 2,
      groupWidth: box.width,
      centerOffset: Math.abs((box.left + box.right) / 2 - (panel.left + panel.right) / 2),
      contentGap: artRight - artWidth - Math.max(...children.map(child => child.getBoundingClientRect().right)),
      headingGap: children[1].getBoundingClientRect().top - children[0].getBoundingClientRect().bottom,
      actionGap: children.at(-1)!.getBoundingClientRect().top - children.at(-2)!.getBoundingClientRect().bottom,
      overflows: element.scrollWidth > element.clientWidth,
      outsideViewport: box.left < 0 || box.right > window.innerWidth,
      repeat: style.backgroundRepeat,
      position: style.backgroundPosition,
    };
  });
  const expectedArtWidth = layout.viewportWidth >= 1024 ? 400 : 216;
  expect(layout.url).toContain('not-found');
  expect(layout.artWidth).toBeCloseTo(expectedArtWidth, 0);
  expect(layout.artHeight).toBeCloseTo(expectedArtWidth * 2 / 3, 0);
  expect(layout.verticalPadding).toBeGreaterThanOrEqual(16);
  expect(layout.panelWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.startOffset).toBeLessThanOrEqual(1);
  expect(layout.inlinePadding).toBeLessThanOrEqual(25);
  expect(layout.groupWidth).toBeLessThanOrEqual(layout.panelWidth);
  expect(layout.groupWidth).toBeGreaterThanOrEqual(layout.panelWidth - 50);
  expect(layout.centerOffset).toBeLessThanOrEqual(1);
  if (layout.viewportWidth >= 1024) expect(layout.contentGap).toBeGreaterThanOrEqual(23);
  expect(layout.headingGap).toBeCloseTo(12, 0);
  expect(layout.actionGap).toBeCloseTo(24, 0);
  expect(layout.overflows).toBe(false);
  expect(layout.outsideViewport).toBe(false);
  expect(layout.repeat).toBe('no-repeat');
  expect(layout.position).toBe(
    layout.viewportWidth >= 1024 ? '100% 50%' : '50% calc(100% - 8px)',
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aspireConsentRequired', 'false'));
});

for (const route of [
  '/reference/api/typescript/',
  '/reference/api/csharp/',
  '/integrations/gallery/',
  '/reference/samples/',
  '/hub/glossary/',
  '/hub/browse/',
  '/aspireconf/',
]) {
  test(`${route} uses shared focus, empty-state typography and prominent artwork`, async ({ page }) => {
    await page.goto(route === '/hub/browse/' ? `${route}?topic=foundations` : route);
    const input = page.locator('main .search-field-input:visible').first();
    await expect(input).toBeEnabled();
    await input.fill('zzzz-no-match');
    const visibleTitle = page.locator('.search-empty-title:visible').first();
    await expect(visibleTitle).toBeVisible();
    const empty = visibleTitle.locator('..').locator('..');
    await expect(empty).toBeVisible();

    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
      await expectBotLayout(empty);
      await input.focus();
      await expect(input).toBeFocused();
      await expect(input).toHaveCSS('outline-style', 'solid');
      await expect(input).toHaveCSS('outline-width', '2px');
      await expect(input).toHaveCSS('outline-offset', '2px');
      await expect(input).toHaveCSS('outline-color', theme === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
      await expect(input).toHaveCSS('box-shadow', 'none');
      if (route === '/hub/browse/') {
        const background = await input.evaluate((element) => getComputedStyle(element).backgroundColor);
        const dropdowns = page.locator('.browse-filter-group > summary');
        for (const dropdown of await dropdowns.all()) await expect(dropdown).toHaveCSS('background-color', background);
        const topic = page.locator('[data-filter-group="topic"] > summary');
        await topic.click();
        await expect(topic).toHaveCSS('background-color', background);
        await topic.press('Escape');
      }

      const colors = await empty.evaluate((element) => {
        const probe = document.createElement('span');
        probe.hidden = true;
        element.append(probe);
        const resolve = (token: string) => {
          probe.style.color = `var(${token})`;
          return getComputedStyle(probe).color;
        };
        const colors = {
          title: resolve('--sl-color-text'),
          hint: resolve('--sl-color-gray-2'),
          action: resolve('--sl-color-text'),
          actionBorder: resolve('--sl-color-gray-5'),
        };
        probe.remove();
        return colors;
      });
      await expect(empty.locator('.search-empty-title')).toHaveCSS('color', colors.title);
      await expect(empty.locator('.search-empty-hint')).toHaveCSS('color', colors.hint);
      await expect(empty.locator('.search-action')).toHaveCSS('color', colors.action);
      await expect(empty.locator('.search-empty-title')).toHaveCSS('font-weight', '600');
      await expect(empty.locator('.search-empty-title')).toHaveCSS('font-size', '16px');
      await expect(empty.locator('.search-empty-title')).toHaveCSS('line-height', '24px');
      for (const selector of ['.search-empty-query', '.search-empty-hint', '.search-action']) {
        await expect(empty.locator(selector)).toHaveCSS('font-size', '14px');
        await expect(empty.locator(selector)).toHaveCSS('line-height', '21px');
        await expect(empty.locator(selector)).toHaveCSS('font-weight', '400');
        await expect(empty.locator(selector)).toHaveCSS('font-style', 'normal');
      }
      await expect(empty).toHaveCSS('border-top-style', 'dashed');
      await expect(empty.locator('.search-action')).toHaveCSS('border-top-style', 'solid');
      await expect(empty.locator('.search-action')).toHaveCSS('border-color', colors.actionBorder);
      await expect(empty.locator('.search-action')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(empty.locator('.search-action')).toHaveCSS('text-decoration-line', 'none');
      expect((await empty.locator('.search-action').boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const summary = page.locator('main .search-results-summary:visible');
      await expect(summary).toHaveCount(1);
      await expect(summary).toHaveCSS('font-size', '14px');
      await expect(summary).toHaveCSS('line-height', '21px');
      await expect(summary).toHaveCSS('font-weight', '400');
      await expect(summary).toHaveCSS('font-style', 'normal');
      await expect(summary).toHaveCSS('color', colors.hint);
    }

    const longQuery = 'zzzz-no-match-'.repeat(12);
    await input.fill(longQuery);
    await expect(empty.locator('.search-empty-query')).toContainText(longQuery);
    await expect(empty.locator('.search-empty-title')).not.toContainText(longQuery);
    await expectBotLayout(empty);
    await empty.locator('.search-action').click();
    await expect(empty).toBeHidden();
    await expect(input).toBeFocused();
  });
}

test('localized empty state keeps long queries and filters clear of the bot at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/de/integrations/gallery/');
  const input = page.locator('main .search-field-input');
  await input.fill('zzzz-no-match-'.repeat(12));
  await page.locator('[data-type="official"]').click();
  const empty = page.locator('main .search-empty:visible');
  await expect(empty.locator('.search-active-filters')).toBeVisible();
  await expectBotLayout(empty);
  await empty.locator('.search-action').click();
  await expect(empty).toBeHidden();
  await expect(input).toBeFocused();
  await page.locator('[data-type="community"]').click();
  await expect(empty).toBeVisible();
  await expect(empty.locator('.search-empty-query')).toBeHidden();
  await expectBotLayout(empty);
  await empty.locator('.search-action').click();
  await expect(empty).toBeHidden();
  await expect(input).toBeFocused();
});
