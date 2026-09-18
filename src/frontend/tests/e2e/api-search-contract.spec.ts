import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dismissCookieConsentIfVisible } from '@tests/e2e/helpers';

test.setTimeout(120_000);

const surfaces = [
  { path: 'csharp/', prefix: 'api' },
  { path: 'csharp/aspire.hosting.redis/', prefix: 'pkg' },
  { path: 'csharp/aspire.hosting.redis/redisresource/', prefix: 'type' },
  { path: 'typescript/', prefix: 'ts-api' },
  { path: 'typescript/aspire.hosting/', prefix: 'pkg' },
  { path: 'typescript/aspire.hosting/idistributedapplicationbuilder/', prefix: 'type' },
];

async function navigateAwayAndBack(page: Page) {
  await page.evaluate(() => {
    Reflect.set(window, '__apiSearchContractVisit', true);
    const link = document.createElement('a');
    link.href = '/reference/overview/';
    document.body.append(link);
    link.click();
  });
  await expect(page).toHaveURL(/\/reference\/overview\/$/);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__apiSearchContractVisit'))).toBe(true);
}

for (const { path, prefix } of surfaces) {
  test(`API full-size input visual parity: ${path}`, async ({ page }) => {
    await page.goto(`/reference/api/${path}?q=Redis`);
    await dismissCookieConsentIfVisible(page);
    const input = page.locator(`#${prefix}-search-input`);
    const field = input.locator('..');
    const clear = page.locator(`#${prefix}-search-clear`);

    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await input.evaluate(element => element.blur());
      await expect(input).toHaveCSS('height', '48px');
      await expect(input).toHaveCSS('font-size', '16px');
      await expect(field.locator('.search-field-icon')).toHaveCSS('width', '18px');
      await expect(field.locator('.search-field-icon')).toHaveCSS('height', '18px');
      await expect.poll(() => input.evaluate(element => {
        const probe = document.createElement('span');
        probe.style.background = 'var(--search-control-bg)';
        probe.style.borderColor = 'var(--search-control-border)';
        probe.style.borderRadius = 'var(--search-control-radius)';
        probe.style.color = 'var(--sl-color-gray-1)';
        element.parentElement!.append(probe);
        const expected = getComputedStyle(probe);
        const actual = getComputedStyle(element);
        const icon = getComputedStyle(element.parentElement!.querySelector('.search-field-icon')!);
        const result = {
          background: actual.backgroundColor === expected.backgroundColor,
          border: actual.borderColor === expected.borderColor,
          radius: actual.borderRadius === expected.borderRadius,
          icon: icon.color === expected.color,
        };
        probe.remove();
        return result;
      })).toEqual({ background: true, border: true, radius: true, icon: true });
      await expect(clear).toBeVisible();
      await expect(clear).toHaveAccessibleName('Clear search');
      await expect(clear).toHaveText('');
      await expect(clear.locator('svg')).toBeVisible();
    }
  });

  test(`API clear/reset contract: ${path}`, async ({ page, isMobile }) => {
    if (isMobile) await page.addInitScript(() => {
      Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
    });
    await page.goto(`/reference/api/${path}?keep=1&sort=name`);
    await dismissCookieConsentIfVisible(page);
    const input = page.locator(`#${prefix}-search-input`);
    const results = page.locator(`#${prefix}-search-results`);
    const empty = results.locator('.search-empty');
    const clear = page.locator(`#${prefix}-search-clear`);
    const filters = page.locator(`#${prefix}-clear-filters`);
    const toolbar = filters.locator('..');
    const chip = page.locator(`#${prefix}-kind-filters .api-filter-chip`).first();
    const query = 'zzzz-no-api-matches';

    await expect(input).toHaveAccessibleName(/search/i);
    await input.fill(query);
    await expect(empty).toContainText(`No API entries match "${query}"`);
    await expect(empty.getByRole('button')).toHaveCount(1);
    await expect(toolbar.locator('button:visible')).toHaveCount(0);
    await empty.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');

    await chip.click();
    await input.fill(query);
    await expect(empty.getByRole('button', { name: 'Clear search', exact: true })).toBeVisible();
    await expect(toolbar.locator('button:visible')).toHaveCount(0);
    await clear.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(input).toBeFocused();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(page).toHaveURL(/kinds=/);

    await filters.click();
    await input.fill(query);
    await expect(input).toHaveValue(query);
    await expect(input).toBeFocused();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(empty.getByRole('button', { name: 'Clear search', exact: true })).toBeVisible();

    await chip.click();
    await expect(empty.getByRole('button', { name: 'Clear search', exact: true })).toBeVisible();
    await navigateAwayAndBack(page);
    await expect(input).toHaveValue(query);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await empty.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await filters.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(page).not.toHaveURL(/[?&](q|kinds)=/);
    await expect(page).toHaveURL(/keep=1&sort=name/);
    await expect(empty).toHaveCount(0);

  });

  test(`API recovery preserves a useful query outside the selected kinds: ${path}`, async ({ page }) => {
    let otherKind = '';
    await page.route(`**/reference/api/${path}?recovery-fixture=1`, async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /(<script[^>]*data-api-search-index[^>]*>)([\s\S]*?)(<\/script>)/,
        (_match: string, open: string, serialized: string, close: string) => {
          const entries = JSON.parse(serialized) as { k: string; v?: string }[];
          const kinds = [...new Set(entries.map(entry => entry.k))];
          expect(kinds.length).toBeGreaterThan(1);
          otherKind = kinds[1];
          const entry = {
            f: 'Example.RecoveryNeedle', ns: 'Example', p: 'Package', s: '', r: '',
            v: entries[0].v, h: '/reference/overview/',
          };
          return `${open}${JSON.stringify([
            { ...entry, n: 'RecoveryNeedle', k: kinds[0] },
            { ...entry, n: 'OtherEntry', f: 'Example.OtherEntry', k: otherKind },
          ])}${close}`;
        },
      );
      await route.fulfill({ response, body });
    });
    await page.goto(`/reference/api/${path}?recovery-fixture=1`);
    await dismissCookieConsentIfVisible(page);
    const input = page.locator(`#${prefix}-search-input`);
    const chip = page.locator(`#${prefix}-kind-filters .api-filter-chip`).filter({ hasText: new RegExp(`^${otherKind}$`, 'i') });
    const filters = page.locator(`#${prefix}-clear-filters`);
    const reset = page.locator(`#${prefix}-reset-all`);
    const toolbar = filters.locator('..');
    const results = page.locator(`#${prefix}-search-results`);
    await expect(toolbar.locator('button:visible')).toHaveCount(0);
    await chip.click();
    await expect(filters).toBeVisible();
    await expect(reset).toBeHidden();
    await input.fill('OtherEntry');
    await expect(results.locator('.api-search-result')).toHaveCount(1);
    await expect(reset).toBeVisible();
    await expect(filters).toBeHidden();
    await expect(toolbar.locator('button:visible')).toHaveCount(1);
    await reset.click();
    await expect(input).toHaveValue('');
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(toolbar.locator('button:visible')).toHaveCount(0);
    await chip.click();
    await input.fill('RecoveryNeedle');
    const empty = results.locator('.search-empty');
    await expect(empty).toContainText('No API entries match "RecoveryNeedle" with these filters');
    await expect(empty.getByRole('list', { name: 'Active filters' }).getByRole('listitem')).toContainText([`Kind: ${otherKind}`]);
    await expect(empty.locator('.search-empty-hint')).not.toContainText('Kind:');
    await expect(empty).toContainText('keep your search text');
    await expect(empty.getByRole('button')).toHaveCount(1);
    await expect(toolbar.locator('button:visible')).toHaveCount(0);
    await expect(page.locator(`#${prefix}-search-clear`)).toBeVisible();
    await empty.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(input).toHaveValue('RecoveryNeedle');
    await expect(input).toBeFocused();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(results.locator('.api-search-result')).toHaveCount(1);
    await expect(toolbar.locator('button:visible')).toHaveCount(0);
    await expect(page).toHaveURL(/q=RecoveryNeedle/);
    await expect(page).not.toHaveURL(/[?&]kinds=/);
  });
}

for (const { path, prefix } of [surfaces[0], surfaces[3]]) {
  test(`API version-only empty recovery persists defaults: ${path}`, async ({ page }) => {
    await page.goto(`/reference/api/${path}?versions=&keep=1`);
    await dismissCookieConsentIfVisible(page);
    const empty = page.locator(`#${prefix}-search-results .search-empty`);
    await expect(empty.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
    await expect(page.locator('.version-filter-btn')).toHaveClass(/none-selected/);
    await empty.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page).not.toHaveURL(/[?&]versions=/);
    await page.reload();
    await expect(page.locator('.version-filter-btn')).not.toHaveClass(/filtered/);
    await expect(page.locator(`#${prefix}-search-count`)).not.toHaveText(/^0 /);

    const button = page.locator('.version-filter-btn');
    await button.click();
    const checkbox = page.locator('.version-filter-cb:not([data-version="__all__"])').first();
    await checkbox.focus();
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    const input = page.locator(`#${prefix}-search-input`);
    await button.click();
    await page.locator('.version-filter-all').click();
    await page.keyboard.press('Escape');
    await input.fill('Redis');
    await expect(empty.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
    await page.locator(`#${prefix}-search-clear`).click();
    await expect(button).toHaveClass(/none-selected/);
    await expect(empty.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
    await input.fill('Redis');
    await empty.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(input).toHaveValue('Redis');
    await expect(button).not.toHaveClass(/filtered/);
    await expect(page).not.toHaveURL(/[?&]versions=/);

    await button.click();
    await page.locator('.version-filter-all').click();
    await page.keyboard.press('Escape');
    await input.fill('zzzz-no-api-matches');
    await expect(empty.getByRole('list', { name: 'Active filters' }).getByRole('listitem')).toContainText(['Versions: none selected']);
    await expect(empty).toContainText('Neither change alone returns results');
    await empty.getByRole('button', { name: 'Reset all', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(button).not.toHaveClass(/filtered/);
    await expect(page).not.toHaveURL(/[?&](q|versions)=/);
  });
}

test('API clear remains available when text is entered before controller mounting', async ({ page }) => {
  let releaseController!: () => void;
  const controllerGate = new Promise<void>(resolve => { releaseController = resolve; });
  await page.route('**/*', async route => {
    if (route.request().resourceType() === 'script') await controllerGate;
    await route.continue();
  });
  await page.goto('/reference/api/typescript/?versions=&keep=1', { waitUntil: 'commit' });
  const input = page.locator('#ts-api-search-input');
  try {
    await input.fill('Redis');
  } finally {
    releaseController();
  }
  await page.waitForLoadState('load');
  const empty = page.locator('#ts-api-search-results .search-empty');
  await expect(empty).toContainText('No API entries match "Redis" with these filters');
  await expect(empty.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
  await expect(page.locator('#ts-api-search-clear')).toBeVisible();
  await page.locator('#ts-api-search-clear').click();
  await expect(input).toHaveValue('');
  await expect(page.locator('.version-filter-btn')).toHaveClass(/none-selected/);
  await expect(empty.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/[?&]keep=1/);
});

test('shared API controls reflow and retain accessible states in both themes', async ({ page }, testInfo) => {
  await page.goto('/reference/api/typescript/?q=zzzz-no-api-matches&kinds=method');
  await dismissCookieConsentIfVisible(page);
  const controls = page.locator('.api-search-bar-unified');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await expect(controls.locator('.search-empty')).toBeVisible();
    const violations = await new AxeBuilder({ page }).include('.api-search-bar-unified')
      .withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(violations.violations).toEqual([]);
    const fits = await controls.evaluate(element => element.scrollWidth <= element.clientWidth + 1);
    expect(fits).toBe(true);
    await controls.screenshot({ path: testInfo.outputPath(`api-search-${theme}.png`) });
  }
});

test('an unavailable API index has an error/reload state, not zero-match recovery', async ({ page }) => {
  await page.route('**/reference/api/typescript/?broken-index=1', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /(<script[^>]*data-api-search-index[^>]*>)[\s\S]*?(<\/script>)/,
      '$1invalid-index$2',
    );
    await route.fulfill({ response, body });
  });
  await page.goto('/reference/api/typescript/?broken-index=1');
  await dismissCookieConsentIfVisible(page);
  const state = page.locator('#ts-api-search-results .search-empty');
  await expect(state).toContainText('Search unavailable');
  await expect(state.getByRole('button')).toHaveCount(1);
  await expect(state.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  await expect(page.locator('#ts-api-search-input')).toBeDisabled();
  await expect(page.locator('#ts-api-package-list')).toBeVisible();
});
