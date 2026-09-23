import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, isMobile }) => {
  await page.addInitScript((swap) => {
    localStorage.setItem('aspireConsentRequired', 'false');
    if (swap) Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true });
  }, isMobile);
});

for (const surface of [
  {
    route: '/hub/browse/?type=blog&sort=oldest', root: 'resource-browser', query: 'aspire',
    input: '#browse-search-input', empty: '.browse-empty', facet: 'type', value: 'blog',
    toolbar: '[data-reset-filters], [data-reset-all]',
  },
  {
    route: '/hub/glossary/?topic=foundations', root: 'glossary-browser', query: 'apphost',
    input: '#glossary-search-input', empty: '[data-glossary-empty]', facet: 'topic', value: 'foundations',
    toolbar: '#glossary-clear-filters',
  },
]) {
  test(`${surface.root} shows one contextual recovery action without competing toolbar links`, async ({ page }) => {
    await page.goto(surface.route);
    const root = page.locator(surface.root);
    const input = root.locator(surface.input);
    const toolbar = root.locator(surface.toolbar).filter({ visible: true });
    const empty = root.locator(surface.empty);
    await expect(toolbar).toHaveCount(1);
    await expect(toolbar).toHaveText('Clear filters');
    await input.fill(surface.query);
    await expect(empty).toBeHidden();
    await expect(toolbar).toHaveCount(1);
    await expect(toolbar).toHaveText('Reset all');

    await input.fill('zzzz-no-match');
    await expect(empty).toBeVisible();
    await expect(toolbar).toHaveCount(0);
    await expect(empty.getByRole('button')).toHaveCount(1);
    await expect(empty.getByRole('button')).toHaveText('Clear search');
    await empty.getByRole('button').click();
    await expect(empty).toBeHidden();
    await expect(input).toBeFocused();
    await expect.poll(() => new URL(page.url()).searchParams.get(surface.facet)).toBe(surface.value);
    await expect(toolbar).toHaveText('Clear filters');

    await input.fill(surface.query);
    await expect(toolbar).toHaveText('Reset all');
    await toolbar.click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(toolbar).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has(surface.facet)).toBe(false);
    if (surface.route.includes('sort=')) expect(new URL(page.url()).searchParams.get('sort')).toBe('oldest');

    await input.fill(surface.query);
    await expect(empty).toBeHidden();
    await expect(toolbar).toHaveCount(0);
    await root.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(input).toHaveValue('');
  });
}

for (const scenario of [
  {
    route: '/hub/browse/?q=ASPIRE001&type=blog&sort=oldest', input: '#browse-search-input',
    empty: '.browse-empty', results: '[data-resource-entry]:not([hidden])', query: 'ASPIRE001',
  },
  {
    route: '/hub/glossary/?q=WaitForCompletion&letter=A', input: '#glossary-search-input',
    empty: '[data-glossary-empty]', results: '[data-glossary-card]:not([hidden])', query: 'WaitForCompletion',
  },
]) {
  test(`${scenario.input} keeps the query when filters exclude its matches`, async ({ page }) => {
    await page.goto(scenario.route);
    const empty = page.locator(scenario.empty);
    await expect(empty).toBeVisible();
    await expect(empty.locator('.search-empty-query')).toHaveText(`Search: "${scenario.query}"`);
    await empty.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(empty).toBeHidden();
    await expect(page.locator(scenario.input)).toHaveValue(scenario.query);
    await expect(page.locator(scenario.input)).toBeFocused();
    await expect(page.locator(scenario.results).first()).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(scenario.query);
    await expect.poll(() => new URL(page.url()).searchParams.has('type') || new URL(page.url()).searchParams.has('letter')).toBe(false);
    if (scenario.route.includes('sort=')) expect(new URL(page.url()).searchParams.get('sort')).toBe('oldest');
    await page.goBack();
    await expect(empty).toBeVisible();
    await expect(page.locator(scenario.input)).toHaveValue(scenario.query);
  });
}

test('browse clears an unmatched query while keeping Foundations and sort preferences', async ({ page }) => {
  await page.goto('/hub/browse/?q=zzzz-no-match&topic=foundations&sort=oldest&title=desc');
  const empty = page.locator('.browse-empty');
  await expect(empty.locator('.search-empty-title')).toHaveText('No matching resources');
  await expect(empty.locator('.search-empty-query')).toHaveText('Search: "zzzz-no-match"');
  await expect(empty.getByRole('list', { name: 'Active filters' }).getByRole('listitem')).toHaveText(['Topic: Foundations']);
  await expect(empty.locator('.search-empty-hint')).not.toContainText('Topic: Foundations');
  await empty.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(empty).toBeHidden();
  await expect(page).toHaveURL(/\?topic=foundations&sort=oldest&title=desc$/);
  await expect(page.locator('#browse-search-input')).toBeFocused();
});

test('browse resets both only when neither individual relaxation restores results', async ({ page }) => {
  await page.goto('/hub/browse/?q=zzzz-no-match&type=diagnostic&provider=aws&sort=oldest');
  const empty = page.locator('.browse-empty');
  await expect(empty.getByRole('button')).toHaveText('Reset all');
  await expect(empty.getByRole('list', { name: 'Active filters' }).getByRole('listitem')).toHaveText(['Type: Diagnostic', 'Provider: AWS']);
  await expect(empty.locator('.search-empty-hint')).toContainText('clears both');
  await empty.getByRole('button').click();
  await expect(page).toHaveURL(/\?sort=oldest$/);
  await expect(empty).toBeHidden();
});

test('glossary resets query and an incompatible topic/letter combination', async ({ page }) => {
  await page.goto('/hub/glossary/');
  const combination = await page.locator('[data-glossary-card]').evaluateAll((cards) => {
    const entries = cards.map((card) => ({
      letter: card.getAttribute('data-letter')!,
      topics: card.getAttribute('data-topics')!.split(' '),
    }));
    for (const topic of new Set(entries.flatMap((entry) => entry.topics))) {
      for (const letter of new Set(entries.map((entry) => entry.letter))) {
        if (!entries.some((entry) => entry.letter === letter && entry.topics.includes(topic))) return { topic, letter };
      }
    }
    return undefined;
  });
  expect(combination).toBeDefined();
  await page.goto(`/hub/glossary/?q=zzzz-no-match&topic=${combination!.topic}&letter=${combination!.letter}`);
  const empty = page.locator('[data-glossary-empty]');
  await expect(empty.getByRole('button')).toHaveText('Reset all');
  await empty.getByRole('button').click();
  await expect(page).toHaveURL(/\/hub\/glossary\/$/);
  await expect(page.locator('#glossary-search-input')).toHaveValue('');
  await expect(empty).toBeHidden();
});

test('long query text wraps safely within the compact empty state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/hub/browse/');
  const query = '<img src=x onerror=alert(1)>' + 'z'.repeat(160);
  await page.locator('#browse-search-input').fill(query);
  const empty = page.locator('.browse-empty');
  await expect(empty.locator('.search-empty-query')).toContainText(query);
  await expect(empty.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
