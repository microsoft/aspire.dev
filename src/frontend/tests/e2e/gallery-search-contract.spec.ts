import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) await page.addInitScript(() => {
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  });
});

async function start(page: Page, path: string) {
  await page.goto(path);
  await dismissCookieConsentIfVisible(page);
}

test('integration query, facets and recovery have independent scopes', async ({ page }) => {
  await start(page, '/integrations/gallery/?keep=1#catalog');
  const input = page.locator('input.filter');
  const official = page.locator('[data-type="official"]');
  const community = page.locator('[data-type="community"]');
  const recovery = page.locator('[data-integration-recover]');
  await expect(input).toHaveAccessibleName(/search/i);
  await input.fill('asfd');
  await expect(recovery).toHaveText('Clear search');
  await official.click();
  await expect(official).toHaveAttribute('aria-pressed', 'false');
  await expect(community).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.search-results-bar .search-action:visible')).toHaveCount(0);
  await expect(page.locator('.no-results .search-action:visible')).toHaveCount(1);
  await expect(recovery).toHaveText('Clear search');
  await expect(page.locator('.no-results .search-empty-title')).toHaveText('No integrations match “asfd”');
  await expect(page.locator('.no-results .search-empty-hint')).toContainText('matching your selected filters');
  const activeFilters = page.locator('.no-results .search-active-filters');
  await expect(activeFilters).toHaveAccessibleName('Active filters');
  await expect(activeFilters.locator('li')).toHaveText([`Excluded: ${(await official.textContent())!.trim()}`]);
  await expect(activeFilters.locator('button, a, input')).toHaveCount(0);
  await expect(page.locator('.no-results .search-empty-hint')).not.toContainText('Excluded:');
  await page.locator('.clear-button').click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await expect(official).toHaveAttribute('aria-pressed', 'false');
  await community.click();
  await expect(recovery).toHaveText('Clear filters');
  await recovery.click();
  await expect(official).toHaveAttribute('aria-pressed', 'true');
  await expect(community).toHaveAttribute('aria-pressed', 'true');
  await input.fill('zzzznonexistent');
  await official.click();
  await expect(page.locator('.search-results-bar .search-action:visible')).toHaveCount(0);
  await official.click();
  await expect(input).toHaveValue('zzzznonexistent');
  await expect(activeFilters).toBeHidden();
  await expect(recovery).toHaveText('Clear search');
  await official.click();
  await recovery.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(official).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-integration-clear-filters]').click();
  await expect(page.locator('[data-integration-count]')).not.toHaveText(/^0 of/);
  await expect(page).toHaveURL(/keep=1#catalog$/);
});

for (const catalog of [
  { name: 'integration', path: '/integrations/gallery/', input: 'input.filter', facet: '[data-type="community"]', clear: '.clear-button', toolbar: '.search-results-bar', empty: '.no-results' },
  { name: 'sample', path: '/reference/samples/', input: '#samples-search-input', facet: '[data-tag]', clear: '[data-clear-btn]', toolbar: '.results-bar', empty: '[data-empty-state]' },
]) {
  test(`${catalog.name} recovery actions follow one contextual hierarchy`, async ({ page }) => {
    await start(page, catalog.path);
    const input = page.locator(catalog.input);
    const facet = page.locator(catalog.facet).first();
    const toolbar = page.locator(`${catalog.toolbar} .search-action:visible`);
    const empty = page.locator(catalog.empty);
    const query = catalog.name === 'sample' ? (await facet.getAttribute('data-tag'))! : 'aspire';
    const tagToggle = page.locator('[data-tag-toggle]');
    if (await tagToggle.isVisible() && await tagToggle.getAttribute('aria-expanded') === 'false') {
      await tagToggle.click();
    }
    await expect(toolbar).toHaveCount(0);
    await facet.click();
    await expect(toolbar).toHaveCount(1);
    await expect(toolbar).toHaveText('Clear filters');
    await input.fill(query);
    await expect(empty).toBeHidden();
    await expect(toolbar).toHaveCount(1);
    await expect(toolbar).toHaveText('Reset all');
    await page.locator(catalog.clear).click();
    await expect(toolbar).toHaveCount(1);
    await expect(toolbar).toHaveText('Clear filters');
    await input.fill(query);
    await expect(toolbar).toHaveText('Reset all');
    await toolbar.click();
    await expect(input).toHaveValue('');
    await expect(toolbar).toHaveCount(0);
    await input.fill(query);
    await expect(empty).toBeHidden();
    await expect(toolbar).toHaveCount(0);
    await input.fill('zzzznonexistent');
    await expect(empty).toBeVisible();
    await expect(toolbar).toHaveCount(0);
    await expect(empty.locator('.search-action:visible')).toHaveCount(1);
    await facet.click();
    await expect(toolbar).toHaveCount(0);
    await expect(empty.locator('.search-action:visible')).toHaveCount(1);
    await expect(empty.locator('.search-action')).toHaveText('Clear search');
    await expect(page.locator(catalog.clear)).toBeVisible();
    await expect(facet).toBeEnabled();
    await empty.locator('.search-action').click();
    await expect(input).toHaveValue('');
    await expect(toolbar).toHaveCount(1);
    await expect(toolbar).toHaveText('Clear filters');
  });
}

test('sample facet-only zero matches recover without changing the query', async ({ page }) => {
  await start(page, '/reference/samples/');
  const pair = await page.locator('[data-sample-item] .sample-card').evaluateAll((cards) => {
    const sets = cards.map((card) => (card.getAttribute('data-tags') ?? '').split(','));
    const tags = [...new Set(sets.flat())].filter(Boolean);
    for (const first of tags) {
      for (const second of tags) {
        if (first !== second && !sets.some((set) => set.includes(first) && set.includes(second))) {
          return [first, second];
        }
      }
    }
    return [];
  });
  expect(pair).toHaveLength(2);
  const toggle = page.locator('[data-tag-toggle]');
  if (await toggle.isVisible()) await toggle.click();
  for (const tag of pair) await page.locator(`[data-tag="${tag}"]`).click();
  const recovery = page.locator('[data-reset-btn]');
  await expect(recovery).toHaveText('Clear filters');
  await expect(page.locator('.results-bar .search-action:visible')).toHaveCount(0);
  await recovery.click();
  await expect(page.locator('#samples-search-input')).toHaveValue('');
  await expect(page.locator('[data-tag][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-empty-state]')).toBeHidden();
  // A real query can be recovered by resetting facets, even if the facet
  // combination itself is empty. Prefer preserving that query.
  for (const tag of pair) await page.locator(`[data-tag="${tag}"]`).click();
  const input = page.locator('#samples-search-input');
  await input.fill(pair[0]);
  await expect(recovery).toHaveText('Clear filters');
  await expect(page.locator('[data-empty-state] .search-empty-title'))
    .toHaveText(`No samples match “${pair[0]}” with your selected filters`);
  const selectedLabels = await page.locator('[data-tag][aria-pressed="true"]').evaluateAll(
    (chips) => chips.map((chip) => chip.getAttribute('data-tag-label')!),
  );
  const activeFilters = page.locator('[data-empty-state] .search-active-filters');
  await expect(activeFilters).toHaveAccessibleName('Active filters');
  await expect(activeFilters.locator('li')).toHaveText(selectedLabels);
  await expect(activeFilters.locator('button, a, input')).toHaveCount(0);
  await expect(page.locator('[data-empty-state] .search-empty-hint')).not.toContainText('Selected filters:');
  await recovery.click();
  await expect(input).toHaveValue(pair[0]);
  await expect(input).toBeFocused();
  await expect(page.locator('[data-empty-state]')).toBeHidden();

  // Neither removing the query nor removing the facets can recover this state.
  for (const tag of pair) await page.locator(`[data-tag="${tag}"]`).click();
  await input.fill('zzzznonexistent');
  await expect(recovery).toHaveText('Reset all');
  await expect(page.locator('.results-bar .search-action:visible')).toHaveCount(0);
  await expect(page.locator('[data-empty-state] .search-empty-hint')).toContainText('reset your search and filters');
  await recovery.click();
  await expect(input).toHaveValue('');
  await expect(page.locator('[data-tag][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-empty-state]')).toBeHidden();
});

test('integration recovery distinguishes a blocked query from an impossible combination', async ({ page }) => {
  await start(page, '/integrations/gallery/');
  const query = await page.locator('.card-grid .card').first().getAttribute('data-title');
  expect(query).toBeTruthy();
  const input = page.locator('input.filter');
  const recovery = page.locator('[data-integration-recover]');
  await page.locator('[data-type="official"]').click();
  await page.locator('[data-type="community"]').click();
  await input.fill(query!);
  await expect(recovery).toHaveText('Clear filters');
  await expect(page.locator('.search-results-bar .search-action:visible')).toHaveCount(0);
  await expect(page.locator('.no-results .search-empty-title'))
    .toHaveText(`No integrations match “${query}” with your selected filters`);
  await recovery.click();
  await expect(input).toHaveValue(query!);
  await expect(input).toBeFocused();
  await expect(page.locator('.no-results')).toBeHidden();
  await page.locator('[data-type="official"]').click();
  await page.locator('[data-type="community"]').click();
  await input.fill('zzzznonexistent');
  await expect(recovery).toHaveText('Reset all');
  await expect(page.locator('.search-results-bar .search-action:visible')).toHaveCount(0);
  await recovery.click();
  await expect(input).toHaveValue('');
  await expect(page.locator('[data-type="official"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-type="community"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.no-results')).toBeHidden();
});

for (const [path, inputSelector, emptySelector] of [
  ['/integrations/gallery/', 'input.filter', '.no-results'],
  ['/reference/samples/', '#samples-search-input', '[data-empty-state]'],
  ['/aspireconf/', '.session-search', '.no-results-msg'],
]) {
  test(`${path} contextual query remains literal text`, async ({ page }) => {
    await start(page, path);
    const query = '<svg/onload=alert(1)>$&';
    await page.locator(inputSelector).fill(query);
    const empty = page.locator(emptySelector);
    await expect(empty).toBeVisible();
    await expect(empty.locator('.search-empty-title')).toContainText(query);
    await expect(empty.locator('.search-empty-title svg')).toHaveCount(0);
    await expect(empty.getByRole('button', { name: 'Clear search', exact: true })).toBeVisible();
  });
}

test('sample query, tags and recovery have independent scopes', async ({ page }) => {
  await start(page, '/reference/samples/?keep=1#catalog');
  const input = page.locator('#samples-search-input');
  const chip = page.locator('[data-tag]').first();
  const recovery = page.locator('[data-reset-btn]');
  await input.fill('zzzznonexistent');
  await expect(recovery).toHaveText('Clear search');
  await chip.click();
  await expect(recovery).toHaveText('Clear search');
  await expect(page.locator('[data-empty-state] .search-empty-title')).toHaveText('No samples match “zzzznonexistent”');
  await expect(page.locator('[data-empty-state] .search-empty-hint')).toContainText('matching your selected filters');
  await page.locator('[data-clear-btn]').click();
  await expect(input).toBeFocused();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await input.fill('zzzznonexistent');
  await expect(page.locator('.results-bar .search-action:visible')).toHaveCount(0);
  await chip.click();
  await expect(input).toHaveValue('zzzznonexistent');
  await expect(page.locator('[data-empty-state] .search-active-filters')).toBeHidden();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await recovery.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-clear-filters]').click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-results-count]')).not.toHaveText(/^0 of/);
  await expect(page).toHaveURL(/keep=1#catalog$/);
});

test('session recovery preserves clock and timezone preferences on repeated visits', async ({ page }) => {
  await start(page, '/aspireconf/');
  await page.evaluate(() => Reflect.set(window, '__sessionSearchNavigation', true));
  for (let visit = 0; visit < 2; visit++) {
    const input = page.locator('.session-search');
    const clock = page.locator('.clock-toggle');
    await clock.click();
    const preference = await clock.getAttribute('data-active');
    const timezone = await page.locator('.tz-toggle').getAttribute('data-active');
    await input.fill('zzzznonexistent');
    await expect(page.locator('.no-results-msg')).toBeVisible();
    await expect(page.locator('.no-results-msg .search-empty-title')).toHaveText('No sessions match “zzzznonexistent”');
    await expect(page.locator('.filter-summary')).toHaveText(/^0 of \d+ sessions$/);
    await page.locator('[data-session-recover]').click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(clock).toHaveAttribute('data-active', preference!);
    await expect(page.locator('.tz-toggle')).toHaveAttribute('data-active', timezone!);
    await expect(page.locator('.no-results-msg')).toBeHidden();
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/reference/overview/';
      document.body.append(link);
      link.click();
    });
    await expect(page).toHaveURL(/\/reference\/overview\/$/);
    await page.goBack();
    await expect(input).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, '__sessionSearchNavigation'))).toBe(true);
  }
});

test('gallery and conference result summaries use regular shared typography', async ({ page }) => {
  for (const [path, inputSelector, summarySelector] of [
    ['/integrations/gallery/', 'input.filter', '[data-integration-count]'],
    ['/reference/samples/', '#samples-search-input', '[data-results-count]'],
    ['/aspireconf/', '.session-search', '.filter-summary'],
  ]) {
    await start(page, path);
    const summary = page.locator(summarySelector);
    await expect(summary).toHaveClass(/search-results-summary/);
    await expect(summary).toHaveCSS('font-size', '14px');
    await expect(summary).toHaveCSS('font-weight', '400');
    await expect(summary).toHaveCSS('font-style', 'normal');
    await expect(summary).toHaveCSS('line-height', '21px');
    await page.locator(inputSelector).fill('zzzznonexistent');
    await expect(summary).toHaveText(/^0 of \d+ (integrations|samples|sessions)$/);
    await expect(summary).toHaveCSS('font-style', 'normal');
  }
});

test('sidebar zero matches have one query recovery and retain focus', async ({ page, isMobile }) => {
  await start(page, '/reference/api/csharp/');
  if (isMobile) await page.locator('starlight-menu-button button').click();
  const input = page.locator('#sidebar-filter-input');
  await expect(input).toHaveAttribute('placeholder', 'Filter by title...');
  const field = input.locator('..');
  await expect(field).toHaveAttribute('data-search-size', 'sm');
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  await expect(input).toHaveCSS('height', coarse ? '48px' : '40px');
  await expect(input).toHaveCSS('font-size', '16px');
  await expect(field.locator('.search-field-icon')).toHaveCSS('width', '18px');
  await expect(field.locator('.search-field-icon polygon')).toHaveAttribute(
    'points', '22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3',
  );
  await expect(field.locator('.search-field-icon circle')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((html, value) => { html.dataset.theme = value; }, theme);
    const background = await input.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--sidebar-dropdown-trigger-bg)';
      element.parentElement!.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      element.blur();
      return color;
    });
    await expect(input).toHaveCSS('background-color', background);
    await input.focus();
    await expect(input).toHaveCSS('background-color', background);
  }
  await input.fill('zzzznonexistent');
  await expect(field.locator('.search-field-clear')).toHaveAccessibleName('Clear search');
  await expect(field.locator('.search-field-clear')).toHaveText('');
  await expect(page.locator('#sidebar-filter-empty')).toBeVisible();
  const empty = page.locator('#sidebar-filter-empty');
  await expect(empty).toHaveCSS('border-top-style', 'dashed');
  await expect(empty).toHaveCSS('padding', '16px');
  await expect(empty).toHaveCSS('background-image', 'none');
  await expect(page.locator('#sidebar-filter-empty-copy')).toHaveClass(/search-empty-title/);
  await expect(page.locator('#sidebar-filter-empty-copy')).toHaveCSS('font-size', '16px');
  await expect(page.locator('#sidebar-filter-empty-copy')).toHaveCSS('font-weight', '600');
  await expect(page.locator('#sidebar-filter-empty-copy')).toHaveCSS('line-height', '24px');
  await expect(empty.locator('.search-empty-hint')).toHaveText('Try another term, or clear your search to browse all results.');
  await expect(empty.locator('.search-empty-hint')).toHaveCSS('font-size', '14px');
  await expect(empty.locator('.search-empty-hint')).toHaveCSS('font-weight', '400');
  await expect(empty.locator('.search-empty-hint')).toHaveCSS('line-height', '21px');
  await expect(page.locator('#sidebar-filter-empty-action')).toHaveCSS('font-size', '14px');
  await expect(page.locator('#sidebar-filter-empty-action')).toHaveCSS('font-weight', '400');
  await expect(page.locator('#sidebar-filter-empty-action')).toHaveCSS('line-height', '21px');
  await expect(page.locator('#sidebar-filter-empty button')).toHaveCount(1);
  const literalQuery = '<img src=x onerror=alert(1)>zzzznonexistent';
  await input.fill(literalQuery);
  await expect(page.locator('#sidebar-filter-empty-copy')).toContainText(literalQuery);
  await expect(empty.locator('img')).toHaveCount(0);
  expect(await empty.evaluate((region) => region.scrollWidth <= region.clientWidth + 1)).toBe(true);
  await page.keyboard.press('Tab');
  await page.locator('#sidebar-filter-empty-action').focus();
  await expect(page.locator('#sidebar-filter-empty-action')).toHaveCSS('outline-style', 'solid');
  await page.locator('#sidebar-filter-empty-action').click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(page.locator('#sidebar-filter-empty')).toBeHidden();
});

for (const theme of ['light', 'dark']) {
  test(`full-size search input geometry and icon-only clear match in ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), theme);
    let baseline: Record<string, string | number> | undefined;
    let emptyTitleColor: string | undefined;
    for (const [path, selector] of [
      ['/hub/browse/', '#browse-search-input'],
      ['/reference/api/csharp/', '#api-search-input'],
      ['/integrations/gallery/', 'input.filter'],
      ['/reference/samples/', '#samples-search-input'],
      ['/aspireconf/', '.session-search'],
    ]) {
      await start(page, path);
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const input = page.locator(selector);
      await input.blur();
      const metrics = await input.evaluate((element) => {
        const style = getComputedStyle(element);
        const icon = element.parentElement!.querySelector('.search-field-icon')!;
        const iconStyle = getComputedStyle(icon);
        return {
          height: element.getBoundingClientRect().height,
          fontSize: style.fontSize,
          background: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
          borderRadius: style.borderRadius,
          padding: style.padding,
          iconWidth: icon.getBoundingClientRect().width,
          iconHeight: icon.getBoundingClientRect().height,
          iconColor: iconStyle.color,
        };
      });
      expect(metrics.height, path).toBe(48);
      expect(metrics.fontSize, path).toBe('16px');
      expect(metrics.iconWidth, path).toBe(18);
      expect(metrics.iconHeight, path).toBe(18);
      if (baseline) expect(metrics, path).toEqual(baseline);
      else baseline = metrics;

      await input.fill('zzzznonexistent');
      const emptyTitle = page.locator('.search-empty:visible .search-empty-title').first();
      await expect(emptyTitle).toBeVisible();
      if (emptyTitleColor) await expect(emptyTitle).toHaveCSS('color', emptyTitleColor);
      else emptyTitleColor = await emptyTitle.evaluate((title) => getComputedStyle(title).color);
      const clear = input.locator('..').locator('.search-field-clear');
      await expect(clear).toBeVisible();
      await expect(clear).toHaveAccessibleName('Clear search');
      await expect(clear).toHaveText('');
      await expect(clear.locator('svg path')).toHaveAttribute('d', 'm18 6-12 12M6 6l12 12');
      const bounds = (await clear.boundingBox())!;
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      expect(bounds.width, path).toBeGreaterThanOrEqual(coarse ? 44 : 36);
      expect(bounds.height, path).toBeGreaterThanOrEqual(coarse ? 44 : 36);
      await clear.focus();
      await expect(clear).toHaveCSS('outline-style', 'solid');
      await clear.press('Enter');
      await expect(input).toHaveValue('');
      await expect(input).toBeFocused();
    }
  });

  test(`sample controls reflow in ${theme} theme`, async ({ page }) => {
    await start(page, '/reference/samples/');
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    await page.locator('#samples-search-input').fill('zzzznonexistent');
    const empty = page.locator('[data-empty-state]');
    await expect(empty).toBeVisible();
    await expect(empty.locator('button')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const [name, path, inputSelector, emptySelector] of [
  ['browse', '/hub/browse/', '#browse-search-input', '.browse-empty'],
  ['integrations', '/integrations/gallery/', 'input.filter', '.no-results'],
]) {
  test(`${name} empty state uses a dashed border and aligned text recovery`, async ({ page }, testInfo) => {
    await start(page, path);
    const input = page.locator(inputSelector);
    const empty = page.locator(emptySelector);
    await input.fill('zzzznonexistent');
    await expect(empty).toBeVisible();
    const action = empty.getByRole('button', { name: 'Clear search', exact: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await expect(empty).toHaveCSS('border-top-style', 'dashed');
      await expect(empty).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(action).toHaveCSS('padding', '0px');
      await action.hover();
      await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const titleBounds = (await empty.locator('.search-empty-title').boundingBox())!;
      const actionBounds = (await action.boundingBox())!;
      expect(actionBounds.x).toBeCloseTo(titleBounds.x, 0);
      const coarsePointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      expect(actionBounds.height).toBeGreaterThanOrEqual(coarsePointer ? 44 : 36);
      await action.focus();
      await expect(action).toHaveCSS('outline-style', 'solid');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include(emptySelector).analyze()).violations).toEqual([]);
      await empty.screenshot({ path: testInfo.outputPath(`${name}-empty-${theme}.png`) });
    }
    await action.press('Enter');
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(empty).toBeHidden();
  });
}
