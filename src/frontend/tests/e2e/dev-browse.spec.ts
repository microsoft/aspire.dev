import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import blogPosts from '../../src/data/aspire-blog-posts.json' with { type: 'json' };

const results = (page: import('@playwright/test').Page) => page.locator('.browse-result:not([hidden])');
const openFacet = async (page: import('@playwright/test').Page, name: string) => {
  const group = page.locator(`[data-filter-group="${name}"]`);
  if (await group.getAttribute('open') === null) {
    await page.keyboard.press('Escape');
    await group.locator('summary').click();
  }
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('card title underlines animate from the left for hover and keyboard focus', async ({ page }) => {
  await page.goto('/hub/browse/?q=aws');
  const link = results(page).first().locator('a');
  const title = link.locator('[data-link-underline]');
  const underline = () => title.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return { transform: style.transform, origin: style.transformOrigin, duration: style.transitionDuration };
  });
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.mouse.move(0, 0);
    await page.getByRole('searchbox', { name: 'Search resources...' }).focus();
    await expect.poll(async () => (await underline()).transform).toBe('matrix(0, 0, 0, 1, 0, 0)');
    await link.hover();
    await expect.poll(async () => (await underline()).transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
    expect((await underline()).origin).toMatch(/^0px /);
    expect((await underline()).duration).toBe(reducedMotion === 'reduce' ? '0s' : '0.36s');
    await page.mouse.move(0, 0);
    await link.focus();
    await expect.poll(async () => (await underline()).transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
  }
});

test('AWS artwork switches to a legible logo for each theme', async ({ page }) => {
  await page.goto('/hub/browse/?q=aws');
  const card = results(page).filter({ has: page.getByRole('heading', { name: 'AWS integrations overview', exact: true }) });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    const logo = card.locator(`.browse-image-${theme}`);
    await expect(logo).toBeVisible();
    await expect(card.locator(`.browse-image-${theme === 'light' ? 'dark' : 'light'}`)).toBeHidden();
    await expect(logo).toHaveAttribute('src', new RegExp(theme === 'light' ? 'aws-light-icon' : 'aws-icon'));
    await expect(logo).toHaveCSS('object-fit', 'contain');
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
});

test('sparse integration cards keep the same content alignment as longer cards', async ({ page }) => {
  await page.goto('/hub/browse/?type=integration&q=Aspire.Hosting.');
  await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
  for (const width of [390, 1558]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Blazor', 'Browsers', 'ClickHouse']) {
      const card = results(page).filter({ has: page.getByRole('heading', { name: `Aspire.Hosting.${name}`, exact: true }) });
      await expect(card).toHaveCount(1);
      const geometry = await card.evaluate((element) => {
        const link = element.querySelector('a')!;
        const copy = element.querySelector('.browse-card-copy')!;
        const box = link.getBoundingClientRect();
        const content = copy.getBoundingClientRect();
        return {
          left: content.left - box.left,
          right: box.right - content.right,
          border: parseFloat(getComputedStyle(link).borderLeftWidth),
        };
      });
      expect(geometry.left).toBeCloseTo(geometry.border, 1);
      expect(geometry.right).toBeCloseTo(geometry.border, 1);
    }
  }
});

test('CSS artwork texture stays subtle, edge-biased, and stable after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/hub/browse/?type=guide');
  await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
  const grain = () => page.locator('.browse-card-artwork:visible').evaluateAll((cards) =>
    cards.map((card) => {
      const style = getComputedStyle(card);
      const texture = getComputedStyle(card, '::before');
      return {
        x: style.getPropertyValue('--grain-x').trim(),
        y: style.getPropertyValue('--grain-y').trim(),
        opacity: texture.opacity,
        mask: texture.maskImage,
        background: texture.backgroundImage,
        animation: texture.animationName,
        pointerEvents: texture.pointerEvents,
      };
    }));
  const original = await grain();
  expect(original.length).toBeGreaterThan(1);
  expect(new Set(original.map(({ x, y }) => `${x},${y}`)).size).toBeGreaterThan(1);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      for (const reducedMotion of ['reduce', 'no-preference'] as const) {
        await page.emulateMedia({ reducedMotion });
        for (const texture of await grain()) {
          expect([texture.x, texture.y].some((position) => position === '0%' || position === '100%')).toBe(true);
          expect(texture.opacity).toBe('0.28');
          expect(texture.mask).toContain('18%');
          expect(texture.background).toContain('repeating-conic-gradient');
          expect(texture.background + texture.mask).not.toContain('url(');
          expect(texture.animation).toBe('none');
          expect(texture.pointerEvents).toBe('none');
        }
      }
    }
  }
  await page.reload();
  await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
  expect((await grain()).map(({ x, y }) => [x, y])).toEqual(original.map(({ x, y }) => [x, y]));
  await expect(page.getByText('Interactive browsing could not load. All resource links are listed below.')).toBeHidden();
  expect(errors).toEqual([]);
  await page.emulateMedia({ forcedColors: 'active' });
  for (const texture of await grain()) expect(texture.background).toMatch(/^none(?:, none)*$/);
});

for (const query of ['', '?type=blog&sort=oldest&title=desc&page=2', '?q=zzzz-no-matching-resource']) {
  test(`initial paint waits for the requested resource state: ${query || 'default'}`, async ({ page }) => {
    const { promise, resolve } = Promise.withResolvers<void>();
    await page.route('**/*ResourceBrowser*', async (route) => {
      if (route.request().resourceType() === 'script') await promise;
      await route.continue();
    });
    await page.addInitScript(() => {
      const observe = () => {
        const cards = [...document.querySelectorAll('[data-resource-entry]')]
          .filter((card) => card.getClientRects().length > 0);
        if (cards.length) {
          document.documentElement.dataset.browseFirstPaint = JSON.stringify(
            cards.map((card) => card.querySelector('a')!.getAttribute('href')),
          );
        } else {
          requestAnimationFrame(observe);
        }
      };
      requestAnimationFrame(observe);
    });
    try {
      await page.goto(`/hub/browse/${query}`, { waitUntil: 'commit' });
      const browser = page.locator('resource-browser');
      await expect(browser).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Loading resources...' })).toBeVisible();
      await expect(page.locator('.browse-result:visible')).toHaveCount(0);
      await expect(page.locator('.browse-loading-grid > li')).toHaveCount(24);
      await expect(page.locator('.browse-search')).toBeHidden();
      const placeholder = await page.locator('.browse-skeleton').first().boundingBox();
      resolve();
      await expect(browser).toHaveAttribute('data-ready', '');
      await expect(browser).not.toHaveAttribute('aria-busy');
      await expect(page.locator('.browse-loading')).toBeHidden();
      if (query.includes('zzzz')) {
        await expect(page.locator('.browse-empty')).toBeVisible();
        await expect(page.locator('.browse-result:visible')).toHaveCount(0);
        await expect(page.locator('html')).not.toHaveAttribute('data-browse-first-paint');
      } else {
        await expect(results(page).first()).toBeVisible();
        const hrefs = await results(page).locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
        await expect(page.locator('html')).toHaveAttribute('data-browse-first-paint', JSON.stringify(hrefs));
        const card = await results(page).first().boundingBox();
        expect(Math.abs(card!.y - placeholder!.y)).toBeLessThanOrEqual(1);
        if (query) {
          await expect(page.locator('[data-page-label]')).toHaveText(/Page 2 of/);
          for (const result of await results(page).all()) await expect(result).toHaveAttribute('data-resource-type', 'blog');
          await expect(page.locator('input[name="sort-date"][value="oldest"]')).toBeChecked();
          await expect(page.locator('input[name="sort-title"][value="desc"]')).toBeChecked();
        } else {
          await expect(results(page)).toHaveCount(24);
        }
      }
    } finally {
      resolve();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}

test('resource links remain usable if the browser controller fails to load', async ({ page }) => {
  await page.route('**/*ResourceBrowser*', (route) => route.request().resourceType() === 'script' ? route.abort() : route.continue());
  await page.goto('/hub/browse/?type=blog');
  await expect(page.getByText('Interactive browsing could not load. All resource links are listed below.')).toBeVisible();
  await expect(page.locator('.browse-loading')).toBeHidden();
  expect(await page.locator('.browse-result:visible').count()).toBeGreaterThan(100);
  await expect(page.locator('template[data-resource-image]')).toHaveCount(0);
  await expect(page.locator('resource-browser')).not.toHaveAttribute('aria-busy');
});

test('only displayed resource artwork is materialized on first load', async ({ page }) => {
  await page.goto('/hub/browse/');
  await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
  const cards = page.locator('[data-resource-entry]');
  const visibleCards = cards.filter({ visible: true });
  expect(await cards.count()).toBeGreaterThan(100);
  await expect(visibleCards).toHaveCount(24);
  await expect(visibleCards.locator('template[data-resource-image]')).toHaveCount(0);
  expect(await cards.filter({ has: page.locator('template[data-resource-image]') }).count()).toBeGreaterThan(0);
  expect(await cards.locator('img').count()).toBeLessThan(75);
});

test('Dev Hub leads to the complete paginated resource directory', async ({ page }) => {
  await page.goto('/hub/');
  await page.getByRole('link', { name: 'Browse all resources', exact: true }).click();
  await expect(page).toHaveURL(/\/hub\/browse\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Browse resources' })).toBeVisible();
  await expect(results(page)).toHaveCount(24);
  const total = await page.locator('.browse-result').count();
  expect(total).toBeGreaterThan(100);
  await expect(page.locator('[data-results-summary]')).toHaveText(`1-24 of ${total} resources`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect(page.locator('[data-page-label]')).toHaveText(/Page 2 of/);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
  await page.goBack();
  await expect(page.locator('[data-page-label]')).toHaveText(/Page 1 of/);
});

test('search, type and topic filters combine and survive reload and browser history', async ({ page }) => {
  await page.goto('/hub/browse/?q=redis&type=integration&topic=integrations');
  await expect(page.getByRole('searchbox', { name: 'Search resources...' })).toHaveValue('redis');
  expect(await results(page).count()).toBeGreaterThan(0);
  for (const card of await results(page).all()) await expect(card).toHaveAttribute('data-resource-type', 'integration');
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search resources...' })).toHaveValue('redis');
  await openFacet(page, 'type');
  const integration = page.getByRole('checkbox', { name: 'Integration', exact: true });
  await expect(integration).toBeChecked();
  await integration.focus();
  await integration.press('Space');
  await expect(integration).not.toBeChecked();
  await expect(page).not.toHaveURL(/type=integration/);
  await page.goBack();
  await expect(page.locator('[data-filter-group="type"]')).not.toHaveAttribute('open');
  await openFacet(page, 'type');
  await expect(integration).toBeChecked();
  await openFacet(page, 'topic');
  await expect(page.getByRole('checkbox', { name: 'Integrations', exact: true })).toBeChecked();
});

test('search highlights card matches through typing, pagination, reload and history', async ({ page }) => {
  await page.goto('/hub/browse/?q=aspire');
  const input = page.getByRole('searchbox', { name: 'Search resources...' });
  const marks = page.locator('mark.browse-search-match');
  const assertHighlights = async (query: string) => {
    await expect(results(page).first()).toBeVisible();
    expect(await results(page).locator('mark.browse-search-match').count()).toBeGreaterThan(0);
    expect(await marks.allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(query, 'i'))]));
    await expect(page.locator('.browse-result[hidden] mark')).toHaveCount(0);
    await expect(marks.locator('mark')).toHaveCount(0);
  };
  await assertHighlights('aspire');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2$/);
  await assertHighlights('aspire');
  await page.reload();
  await assertHighlights('aspire');
  await input.fill('REDIS cach');
  await assertHighlights('redis');
  expect((await marks.allTextContents()).every((text) => /^(redis|cach)$/i.test(text))).toBe(true);
  await expect(results(page).locator('h3 mark').first()).toBeVisible();
  expect(await results(page).locator('p mark').count()).toBeGreaterThan(0);
  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
    const style = await results(page).locator('mark').first().evaluate((mark) => {
      const computed = getComputedStyle(mark);
      return { background: computed.backgroundColor, color: computed.color, padding: computed.padding };
    });
    expect(style.background).not.toBe('rgb(255, 255, 0)');
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.color).not.toBe(style.background);
    expect(style.padding).toBe('0px');
  }
  await page.locator('#browse-search-clear').click();
  await expect(marks).toHaveCount(0);
  await expect(page).toHaveURL(/\/hub\/browse\/$/);
  await page.goBack();
  await expect(input).toHaveValue('REDIS cach');
  await assertHighlights('redis');
  await input.fill('<img src=x onerror=alert(1)>');
  await expect(page.locator('.browse-empty')).toBeVisible();
  await expect(page.locator('.browse-empty .search-empty-query')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.browse-empty img')).toHaveCount(0);
  await expect(marks).toHaveCount(0);
  await expect(page.locator('[data-search-highlight] img')).toHaveCount(0);
  await input.fill('   ');
  await expect(results(page)).toHaveCount(24);
  await expect(marks).toHaveCount(0);
});

test('tutorials and quickstarts keep their integration topic, while includes stay excluded', async ({ page }) => {
  await page.goto('/hub/browse/?type=tutorial&topic=integrations');
  for (const article of ['hosting-integrations', 'client-integrations', 'secure-communication']) {
    await expect(results(page).locator(`a[href="/integrations/custom-integrations/${article}/"]`)).toBeVisible();
  }
  await page.goto('/hub/browse/?type=quickstart&topic=integrations');
  await expect(results(page).locator('a[href="/integrations/frameworks/rust/rust-get-started/"]')).toBeVisible();
  await expect(results(page).locator('a[href="/integrations/devtools/k6/k6-get-started/"]')).toBeVisible();
  for (const card of await results(page).all()) {
    await expect(card).toHaveAttribute('data-resource-type', 'quickstart');
    await expect(card.locator('.browse-card-kind')).toHaveText('Quickstart');
  }
  await page.goto('/hub/browse/?type=quickstart');
  await expect(results(page).locator('a[href="/get-started/github-codespaces/"]')).toBeVisible();
  await expect(results(page).locator('a[href="/get-started/dev-containers/"]')).toBeVisible();
  await expect(page.locator('.browse-result a[href*="/includes/"]')).toHaveCount(0);
});

test('article language filters include AppHost and consuming-client examples', async ({ page }) => {
  for (const language of ['csharp', 'typescript']) {
    await page.goto(`/hub/browse/?q=first%20app&type=quickstart&language=${language}`);
    await expect(results(page).locator('a[href="/get-started/first-app/"]')).toBeVisible();
  }
  for (const language of ['csharp', 'typescript', 'python', 'go']) {
    await page.goto(`/hub/browse/?q=connect%20openai&type=integration&language=${language}`);
    await expect(results(page).locator('a[href="/integrations/ai/openai/openai-connect/"]')).toBeVisible();
  }
});

test('every ingested official blog post is reachable across resource pages', async ({ page }) => {
  await page.goto('/hub/browse/?type=blog&sort=newest');
  await expect(results(page).first()).toBeVisible();
  const seen = new Set<string>();
  while (true) {
    for (const href of await results(page).locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')!))) {
      expect(seen.has(href)).toBe(false);
      seen.add(href);
    }
    const next = page.getByRole('button', { name: 'Next', exact: true });
    if (!await next.isVisible() || await next.isDisabled()) break;
    await next.click();
  }
  for (const post of blogPosts) expect(seen.has(post.href), post.title).toBe(true);
});

test('reference identities and release imagery stay distinct in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/hub/browse/?q=aspire%20docs%20api%20search&type=reference');
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    const command = results(page).filter({ has: page.locator('a[href="/reference/cli/commands/aspire-docs-api-search/"]') });
    await expect(command.locator('.browse-artwork-detail code')).toHaveText('aspire docs api search');
    await expect(command.locator('.browse-card-kind')).toHaveText('CLI command');
    const detail = await command.locator('.browse-artwork-detail').boundingBox();
    const badge = await command.locator('.browse-card-kind').boundingBox();
    expect(detail!.y + detail!.height).toBeLessThanOrEqual(badge!.y);
    await page.goto('/hub/browse/?q=ASPIRE001&type=diagnostic');
    await expect(results(page).locator('.browse-artwork-detail code')).toHaveText('ASPIRE001');
    await page.goto('/hub/browse/?type=release-notes');
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    const release = results(page).filter({ has: page.locator('a[href="/whats-new/aspire-13-2/"]') });
    const image = release.locator(`.browse-image-${theme}`);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await image.evaluate((element: HTMLImageElement) => element.decode());
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    const fallback = results(page).filter({ has: page.locator('a[href="/whats-new/aspire-13-4/"]') });
    await expect(fallback.locator('.browse-artwork-detail code')).toHaveText('13.4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('empty results preserve useful filters and unknown URL state is normalized', async ({ page }) => {
  await page.goto('/hub/browse/?q=not-a-real-resource-555&type=glossary');
  await expect(page.getByRole('heading', { name: 'No matching resources' })).toBeVisible();
  await expect(page.locator('.browse-empty .search-empty-query')).toHaveText('Search: "not-a-real-resource-555"');
  await expect(results(page)).toHaveCount(0);
  await page.locator('.browse-empty').getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page).toHaveURL(/\/hub\/browse\/\?type=glossary$/);
  await expect(results(page)).toHaveCount(24);
  await expect(page.locator('.browse-result:not([hidden])[data-resource-type="glossary"]')).toHaveCount(24);
  await expect(page.getByRole('searchbox', { name: 'Search resources...' })).toBeFocused();
  await page.goto('/hub/browse/?type=unknown&topic=unknown&page=999999999&sort=unknown');
  await expect(results(page).first()).toBeVisible();
  await expect(page).not.toHaveURL(/unknown|999999999/);
});

test('multi-type filters and sorting reflect their URL state', async ({ page }) => {
  await page.goto('/hub/browse/?type=video&type=blog');
  const types = await results(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('data-resource-type')));
  expect(types.every((type) => type === 'video' || type === 'blog')).toBe(true);
  await expect(page.locator('[data-filter-group="sort"] summary')).toHaveAccessibleName('Sort by: Date Newest first, then Title A-Z');
  await expect(page.locator('[data-sort-direction]')).toHaveCount(0);
  const dates = await results(page).locator('time').evaluateAll((times) => times.map((time) => time.getAttribute('datetime')!.slice(0, 10)));
  expect(dates.length).toBeGreaterThan(0);
  expect(dates).toEqual([...dates].sort().reverse());
});

test('legacy provider links do not leave an invisible filter active', async ({ page }) => {
  await page.goto('/hub/browse/?type=sample&sort=oldest');
  await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
  const initialResults = await results(page).locator('h3').allTextContents();
  const initialSummary = await page.locator('[data-results-summary]').textContent();
  await page.goto('/hub/browse/?keep=1&type=sample&provider=aws&provider=azure&sort=oldest');
  await expect(page).toHaveURL(/\?keep=1&type=sample&sort=oldest$/);
  await expect(page.locator('[data-filter-group="provider"], input[name="provider"]')).toHaveCount(0);
  await expect(results(page).locator('h3')).toHaveText(initialResults);
  await expect(page.locator('[data-results-summary]')).toHaveText(initialSummary!);
  await page.reload();
  await expect(results(page).locator('h3')).toHaveText(initialResults);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\?keep=1&sort=oldest$/);
  await page.goBack();
  await expect(page).toHaveURL(/\?keep=1&type=sample&sort=oldest$/);
  await expect(results(page).locator('h3')).toHaveText(initialResults);
});

test('multiple languages combine with other filters and survive reload, history, and clearing', async ({ page }) => {
  await page.goto('/hub/browse/?type=sample&language=csharp&language=typescript');
  await openFacet(page, 'language');
  const csharp = page.locator('input[name="language"][value="csharp"]');
  const typescript = page.locator('input[name="language"][value="typescript"]');
  await expect(csharp).toBeChecked();
  await expect(typescript).toBeChecked();
  await expect(page.locator('[data-filter-active="language"]')).toBeVisible();
  await expect(page.locator('[data-filter-group="language"] summary')).toHaveText('Language');
  await expect(page.locator('[data-filter-group="language"] summary')).toHaveAccessibleName('Language, 2 selected');
  const allEntries = await page.locator('[data-resource-entry]').evaluateAll((cards) =>
    cards.map((card) => JSON.parse(card.getAttribute('data-resource-entry')!) as { type: string; language: string[] }));
  const expected = allEntries.filter((entry) => entry.type === 'sample'
    && entry.language.some((language) => ['csharp', 'typescript'].includes(language))).length;
  expect(expected).toBeGreaterThan(0);
  await expect(results(page)).toHaveCount(Math.min(24, expected));
  await expect(page.locator('[data-results-summary]')).toHaveText(`1-${Math.min(24, expected)} of ${expected} resources`);
  await page.reload();
  await openFacet(page, 'language');
  await expect(csharp).toBeChecked();
  await expect(typescript).toBeChecked();
  await csharp.focus();
  await csharp.press('Space');
  await expect(csharp).not.toBeChecked();
  await expect.poll(() => new URL(page.url()).searchParams.getAll('language')).toEqual(['typescript']);
  await page.goBack();
  await expect(csharp).toBeChecked();
  await expect(typescript).toBeChecked();
  await expect(page.locator('[data-filter-group="language"]')).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(csharp).not.toBeChecked();
  await expect(typescript).not.toBeChecked();
  await expect(page.locator('[data-filter-active="language"]')).toBeHidden();
  await expect(page).toHaveURL(/\/hub\/browse\/$/);
});

test('all resource variants render, with bounded cards and no horizontal overflow', async ({ page }) => {
  for (const type of ['video', 'sample', 'integration', 'glossary', 'diagnostic', 'blog']) {
    await page.goto(`/hub/browse/?type=${type}`);
    expect(await results(page).count()).toBeGreaterThan(0);
    await expect(results(page).first()).toHaveAttribute('data-resource-type', type);
  }
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/hub/browse/?q=AppHost&type=glossary');
    const columns = await page.locator('.browse-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width < 600 ? 1 : width < 1200 ? 2 : 3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 900) {
      await expect(page.locator('[data-filter-group="type"]')).not.toHaveAttribute('open');
      await openFacet(page, 'type');
      await expect(page.getByRole('checkbox', { name: 'Glossary', exact: true })).toBeVisible();
    }
  }
});

for (const width of [390, 768, 1440]) {
  test(`shared breadcrumbs and uniform image headers at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/hub/browse/');
    await expect(page.locator('.dev-breadcrumbs .breadcrumb')).toHaveCount(1);
    const hubMark = await page.getByRole('banner').getByRole('link', { name: 'Aspire resources', exact: true }).locator('svg').innerHTML();
    await expect(page.locator('.dev-breadcrumbs a[href="/hub/"] svg')).toHaveCount(2);
    for (const mark of await page.locator('.dev-breadcrumbs a[href="/hub/"] svg').all()) {
      await expect(mark).toHaveAttribute('aria-hidden', 'true');
      expect(await mark.innerHTML()).toBe(hubMark);
    }
    await expect(page.locator('.browse-trail')).toHaveCount(0);
    if (width === 390) {
      await page.locator('.bc-collapse > summary').click();
      await expect(page.locator('.bc-dropdown').getByRole('link', { name: 'Aspire resources' })).toBeVisible();
    }
    for (const type of ['guide', 'integration', 'video', 'sample', 'glossary', 'blog']) {
      await page.goto(`/hub/browse/?type=${type}`);
      await expect(results(page).first()).toBeVisible();
      await expect(page.locator('.browse-card-preview')).toHaveCount(await page.locator('.browse-result').count());
      for (const card of (await results(page).all()).slice(0, 3)) {
        const preview = card.locator('.browse-card-preview');
        await expect(preview.locator('.browse-card-kind')).toHaveCount(1);
        const kindIcon = preview.locator('.resource-kind-icon');
        await expect(kindIcon).toHaveCount(1);
        await expect(kindIcon).toHaveCSS('mask-image', /url/);
        expect((await kindIcon.boundingBox())!.width).toBeGreaterThanOrEqual(16);
        await expect(card.locator('.browse-card-copy .browse-card-kind')).toHaveCount(0);
        await expect(card.locator('.browse-card-kind')).toHaveCount(1);
        await expect(card.locator('.browse-artwork-brand, .browse-card-topic')).toHaveCount(0);
        await preview.scrollIntoViewIfNeeded();
        const box = await preview.boundingBox();
        expect(box!.width).toBeGreaterThan(150);
        expect(Math.abs(box!.width / box!.height - 16 / 9)).toBeLessThan(0.03);
      }
    }
  });
}

test('video platforms remain searchable metadata without a dedicated filter', async ({ page }) => {
  await page.goto('/hub/browse/');
  const initialResults = await results(page).locator('h3').allTextContents();
  await expect(page.locator('[data-filter-group="platform"]')).toHaveCount(0);
  await page.goto('/hub/browse/?platform=twitch');
  expect(await results(page).locator('h3').allTextContents()).toEqual(initialResults);
  await page.getByRole('searchbox', { name: 'Search resources...' }).fill('twitch');
  await expect(results(page).getByRole('link', { name: 'Aspire on Twitch', exact: true })).toHaveAttribute('href', 'https://www.twitch.tv/aspiredotdev');
  await expect(page).not.toHaveURL(/platform=/);
});

test('top filters support keyboard dismissal and stay within the viewport', async ({ page }) => {
  await page.goto('/hub/browse/');
  await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
  const controls = page.locator('.browse-controls');
  const controlsBox = (await controls.boundingBox())!;
  const search = await page.locator('.browse-search').boundingBox();
  const filters = await page.locator('.browse-filters').boundingBox();
  const grid = await page.locator('.browse-grid').boundingBox();
  expect(filters!.y + filters!.height).toBeLessThan(grid!.y);
  expect(filters!.y).toBeGreaterThanOrEqual(search!.y);
  expect(grid!.x).toBeCloseTo(controlsBox.x, 0);
  expect(grid!.width).toBeCloseTo(controlsBox.width, 0);
  const inset = await controls.evaluate((element) => {
    const style = getComputedStyle(element);
    return parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
  });
  expect(inset).toBeGreaterThanOrEqual(16);
  expect(search!.x - controlsBox.x).toBeCloseTo(inset, 0);
  for (const name of ['type', 'topic', 'language', 'sort']) {
    const group = page.locator(`[data-filter-group="${name}"]`);
    await group.locator('summary').focus();
    await group.locator('summary').press('Enter');
    await expect(group).toHaveAttribute('open');
    const box = await group.locator('.browse-filter-panel').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
    await group.locator('input:not(:disabled)').first().focus();
    await page.keyboard.press('Escape');
    await expect(group).not.toHaveAttribute('open');
    await expect(group.locator('summary')).toBeFocused();
  }
  await openFacet(page, 'type');
  await page.locator('[data-filter-group="language"] summary').focus();
  await page.locator('[data-filter-group="language"] summary').press('Enter');
  await expect(page.locator('[data-filter-group="type"]')).not.toHaveAttribute('open');
  await page.getByRole('searchbox', { name: 'Search resources...' }).focus();
  await expect(page.locator('[data-filter-group="language"]')).not.toHaveAttribute('open');
  await openFacet(page, 'sort');
  const sort = page.locator('[data-filter-group="sort"]');
  await sort.getByRole('radio', { name: 'Newest first', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(sort).toHaveAttribute('open');
  await expect(sort.getByRole('radio', { name: 'Oldest first', exact: true })).toBeChecked();
  await expect(sort.getByRole('radio', { name: 'Title (A-Z)', exact: true })).toBeChecked();
  await expect(page).toHaveURL(/sort=oldest$/);
  await sort.getByRole('radio', { name: 'Title (A-Z)', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(sort.getByRole('radio', { name: 'Title (Z-A)', exact: true })).toBeChecked();
  await expect(sort.getByRole('radio', { name: 'Oldest first', exact: true })).toBeChecked();
  await expect(page).toHaveURL(/sort=oldest&title=desc$/);
  await page.keyboard.press('Enter');
  await expect(sort).not.toHaveAttribute('open');
  await expect(sort.locator('summary')).toBeFocused();
  await openFacet(page, 'sort');
  await sort.getByRole('radio', { name: 'Title (A-Z)', exact: true }).click();
  await expect(sort).toHaveAttribute('open');
  await expect(sort.getByRole('radio', { name: 'Oldest first', exact: true })).toBeChecked();
});

test('mobile filters open as readable fixed panels without shifting results', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/hub/browse/');
  const gridTop = (await page.locator('.browse-grid').boundingBox())!.y;
  const type = page.locator('[data-filter-group="type"]');
  await type.locator('summary').click();
  const panel = type.locator('.browse-filter-panel');
  await expect(panel).toHaveCSS('position', 'fixed');
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeLessThanOrEqual(12);
  expect(box.width).toBeGreaterThanOrEqual(350);
  expect(box.y).toBeGreaterThanOrEqual(70);
  expect(box.y).toBeLessThanOrEqual(90);
  expect(box.y + box.height).toBeLessThanOrEqual(692);
  await expect(type.getByRole('button', { name: 'Close Type' })).toBeVisible();
  await expect(type.locator('.browse-filter-mobile-header strong')).toHaveText('Type');
  const closeBox = (await type.getByRole('button', { name: 'Close Type' }).boundingBox())!;
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  await expect(type.locator('.browse-filter-backdrop')).toBeVisible();
  for (const option of await type.locator('.browse-filter-option').all()) {
    expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await type.locator('fieldset').evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  expect((await page.locator('.browse-grid').boundingBox())!.y).toBe(gridTop);
  await type.locator('.browse-filter-backdrop').click({ position: { x: 5, y: 75 } });
  await expect(type).not.toHaveAttribute('open');
  await expect(type.locator('summary')).toBeFocused();

  const sort = page.locator('[data-filter-group="sort"]');
  await sort.locator('summary').click();
  for (const choice of await sort.locator('.browse-sort-choice').all()) {
    const choiceBox = (await choice.boundingBox())!;
    expect(choiceBox.width).toBeGreaterThanOrEqual(44);
    expect(choiceBox.height).toBeGreaterThanOrEqual(44);
  }
  await sort.getByRole('button', { name: 'Close Sort by' }).click();
  await expect(sort).not.toHaveAttribute('open');
  await expect(sort.locator('summary')).toBeFocused();
});

test('every dropdown shows responsive options without a separate search input', async ({ page }) => {
  await page.goto('/hub/browse/?page=2');
  await expect(results(page)).toHaveCount(24);
  await expect(page.locator('.browse-filters select')).toHaveCount(0);
  await expect(page.locator('.dev-description, .browse-search .inpage-search-label')).toHaveCount(0);
  const initialUrl = page.url();
  const initialResults = await results(page).locator('h3').allTextContents();
  const mobile = page.viewportSize()!.width < 600;
  for (const name of ['type', 'topic', 'language', 'sort']) {
    const group = page.locator(`[data-filter-group="${name}"]`);
    await expect(group).toHaveCSS('user-select', 'none');
    // A second pointer click would hit the newly opened mobile overlay.
    if (!mobile) await group.locator('[data-dropdown-label]').dblclick();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
    await group.locator('summary').focus();
    await group.locator('summary').press('ArrowDown');
    await expect(group.getByRole('searchbox')).toHaveCount(0);
    const firstEnabled = group.locator('input:not(:disabled)').first();
    await expect(firstEnabled).toBeFocused();
    const options = group.locator('[data-option-label]');
    expect(await options.count()).toBeGreaterThan(0);
    await expect(group.locator('[data-option-label][hidden]')).toHaveCount(0);
    const box = await options.first().boundingBox();
    if (mobile) {
      expect(box!.height).toBeGreaterThanOrEqual(name === 'sort' ? 56 : 44);
    } else {
      expect(box!.height).toBeLessThanOrEqual(36);
      expect(box!.height).toBeGreaterThanOrEqual(24);
    }
    expect(page.url()).toBe(initialUrl);
    expect(await results(page).locator('h3').allTextContents()).toEqual(initialResults);
    await firstEnabled.press('Escape');
    await expect(group).not.toHaveAttribute('open');
    await expect(group.locator('summary')).toBeFocused();
    await openFacet(page, name);
    await group.locator('summary').press('Tab');
    if (mobile) {
      const close = group.getByRole('button', { name: /^Close / });
      await expect(close).toBeFocused();
      await close.press('Tab');
    }
    await expect(group.locator('input:focus')).toHaveCount(1);
    await group.locator('input:focus').press('Escape');
  }
  const search = page.getByRole('searchbox', { name: 'Search resources...' });
  await search.fill('Aspire');
  await search.press('ControlOrMeta+A');
  expect(await search.evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart!, el.selectionEnd!))).toBe('Aspire');
});

test('filter changes preserve control and result positions', async ({ page }) => {
  await page.goto('/hub/browse/');
  const measure = () => page.locator('.browse-search, .browse-filters, .browse-grid, .browse-filter-group > summary').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width };
    }));
  const before = await measure();
  await openFacet(page, 'type');
  await page.getByRole('checkbox', { name: 'Glossary', exact: true }).check();
  expect(await measure()).toEqual(before);
  await page.getByRole('checkbox', { name: 'Glossary', exact: true }).uncheck();
  expect(await measure()).toEqual(before);
  await page.keyboard.press('Escape');
  await openFacet(page, 'language');
  await page.getByRole('checkbox', { name: 'TypeScript', exact: true }).check();
  expect(await measure()).toEqual(before);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  expect(await measure()).toEqual(before);
  await page.getByRole('searchbox', { name: 'Search resources...' }).fill('no-results-555');
  const emptyPositions = await measure();
  expect(emptyPositions.slice(0, -1)).toEqual(before.slice(0, -1));
});

test('type options use available height without unnecessary scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/hub/browse/');
  await openFacet(page, 'type');
  const list = page.locator('[data-filter-group="type"] fieldset');
  const dimensions = await list.evaluate((element) => ({ content: element.scrollHeight, visible: element.clientHeight }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.visible);
  await expect(page.getByRole('checkbox', { name: 'Release notes', exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 700 });
  await openFacet(page, 'type');
  const panel = await page.locator('[data-filter-group="type"] .browse-filter-panel').boundingBox();
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(700);
});

test('filtered selections persist alongside sort history and clearing', async ({ page }) => {
  await page.goto('/hub/browse/?language=csharp');
  await openFacet(page, 'language');
  const group = page.locator('[data-filter-group="language"]');
  await group.getByRole('checkbox', { name: 'TypeScript', exact: true }).check();
  await expect.poll(() => new URL(page.url()).searchParams.getAll('language')).toEqual(['csharp', 'typescript']);
  await openFacet(page, 'sort');
  await page.getByRole('radio', { name: 'Oldest first', exact: true }).check();
  await expect(page).toHaveURL(/sort=oldest/);
  await page.goBack();
  await expect(page.locator('[data-filter-group="sort"] summary')).toHaveAccessibleName('Sort by: Date Newest first, then Title A-Z');
  await page.reload();
  await expect.poll(() => new URL(page.url()).searchParams.getAll('language')).toEqual(['csharp', 'typescript']);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.browse-filters input:checked[type="checkbox"]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/hub\/browse\/$/);
});

test('date and title directions persist across searches, reloads and history', async ({ page }) => {
  await page.goto('/hub/browse/?type=blog&page=2');
  const checkOrder = async (dateSort: 'newest' | 'oldest', titleSort: 'asc' | 'desc') => {
    const entries = await page.locator('[data-resource-type="blog"]').evaluateAll((cards) =>
      cards.map((card) => JSON.parse(card.getAttribute('data-resource-entry')!) as { id: string; title: string; date: string }));
    entries.sort((a, b) => {
      if (a.date !== b.date) {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return dateSort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      }
      const title = a.title.localeCompare(b.title, 'en', { numeric: true }) || a.id.localeCompare(b.id);
      return titleSort === 'asc' ? title : -title;
    });
    expect(await results(page).locator('h3').allTextContents()).toEqual(entries.slice(0, 24).map(({ title }) => title));
  };
  const sort = page.locator('[data-filter-group="sort"]');
  await openFacet(page, 'sort');
  await expect(page.getByRole('radiogroup', { name: 'Date order', exact: true }).getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('radiogroup', { name: 'Title order', exact: true }).getByRole('radio')).toHaveCount(2);
  await expect(sort.locator('input:checked')).toHaveCount(2);
  await expect(sort.locator('[data-sort-selection="date"]')).toHaveText('Newest first');
  await expect(sort.locator('[data-sort-selection="title"]')).toHaveText('A-Z');
  for (const label of await sort.locator('.browse-sort-label').all()) {
    await expect(label).toHaveCSS('display', 'flex');
    const mobile = page.viewportSize()!.width < 600;
    await expect(label).toHaveCSS('flex-direction', mobile ? 'column' : 'row');
    expect(await label.evaluate((element) => parseFloat(getComputedStyle(element).gap))).toBeGreaterThanOrEqual(mobile ? 1 : 6);
  }
  for (const icon of await sort.locator('.browse-sort-icon').all()) {
    await expect(icon).toBeVisible();
    expect(await icon.evaluate((element) => getComputedStyle(element).maskImage)).toContain('data:image/svg+xml');
  }
  await page.getByRole('radio', { name: 'Oldest first', exact: true }).check();
  await expect(page).toHaveURL(/sort=oldest/);
  await expect(page).not.toHaveURL(/page=/);
  await checkOrder('oldest', 'asc');
  await expect(page.getByRole('radio', { name: 'Best match', exact: true })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Title (Z-A)', exact: true }).check();
  await expect(sort).toHaveAttribute('open');
  await expect(page.getByRole('radio', { name: 'Oldest first', exact: true })).toBeChecked();
  await expect(page).toHaveURL(/sort=oldest&title=desc/);
  await checkOrder('oldest', 'desc');
  await page.getByRole('radio', { name: 'Newest first', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Title (Z-A)', exact: true })).toBeChecked();
  await checkOrder('newest', 'desc');
  await page.getByRole('radio', { name: 'Oldest first', exact: true }).check();
  await expect(page).toHaveURL(/sort=oldest/);
  await page.reload();
  await expect(sort.locator('summary')).toHaveAccessibleName('Sort by: Date Oldest first, then Title Z-A');
  await openFacet(page, 'sort');
  await expect(sort.locator('[data-sort-selection="date"]')).toHaveText('Oldest first');
  await expect(sort.locator('[data-sort-selection="title"]')).toHaveText('Z-A');
  await expect(sort.locator('input:checked')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox', { name: 'Search resources...' }).fill('aspire');
  await expect(page).toHaveURL(/sort=oldest&title=desc/);
  await page.goBack();
  await expect(page).toHaveURL(/\?type=blog&title=desc$/);
  await expect(sort.locator('summary')).toHaveAccessibleName('Sort by: Date Newest first, then Title Z-A');
  await checkOrder('newest', 'desc');
  await page.goForward();
  await expect(sort.locator('summary')).toHaveAccessibleName('Sort by: Date Oldest first, then Title Z-A');
  await expect(page.getByRole('searchbox', { name: 'Search resources...' })).toHaveValue('aspire');
  await page.getByRole('button', { name: 'Reset all', exact: true }).click();
  await expect(page).toHaveURL(/\/hub\/browse\/\?sort=oldest&title=desc$/);
  await expect(sort.locator('summary')).toHaveAccessibleName('Sort by: Date Oldest first, then Title Z-A');
});

test('history returns focus from hidden pagination and closed filter options without stealing it', async ({ page }) => {
  await page.goto('/hub/browse/');
  const search = page.getByRole('searchbox', { name: 'Search resources...' });
  const nav = page.getByRole('navigation', { name: 'Resource pages' });
  await openFacet(page, 'type');
  await page.getByRole('checkbox', { name: 'Quickstart', exact: true }).check();
  await expect(page).toHaveURL(/type=quickstart/);
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\/hub\/browse\/$/);
  await nav.locator('[aria-current="page"]').focus();
  await page.goBack();
  await expect(nav).toBeHidden();
  await expect(search).toBeFocused();

  await page.goForward();
  await openFacet(page, 'type');
  const group = page.locator('[data-filter-group="type"]');
  await group.locator('summary').press('ArrowDown');
  await expect(group.locator('input:not(:disabled)').first()).toBeFocused();
  await page.goBack();
  await expect(group).not.toHaveAttribute('open');
  await expect(group.locator('summary')).toBeFocused();

  await page.goForward();
  const hub = page.getByRole('banner').getByRole('link', { name: 'Aspire resources', exact: true });
  await hub.focus();
  await page.goBack();
  await expect(hub).toBeFocused();
});

test('numbered pagination preserves combined sorting, keyboard focus, history, and page boundaries', async ({ page }) => {
  await page.goto('/hub/browse/?sort=oldest&title=desc&page=8');
  const nav = page.getByRole('navigation', { name: 'Resource pages' });
  const pages = Math.ceil(await page.locator('.browse-result').count() / 24);
  const active = nav.locator('[aria-current="page"]');
  await expect(active).toHaveText('8');
  await expect(nav.locator('.browse-page-gap')).toHaveCount(2);
  expect(await nav.locator('[data-page]').count()).toBeLessThanOrEqual(7);
  const currentUrl = page.url();
  await active.scrollIntoViewIfNeeded();
  const currentScroll = await page.evaluate(() => scrollY);
  await active.click();
  expect(page.url()).toBe(currentUrl);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(currentScroll, 0);
  await nav.getByRole('button', { name: 'Page 7', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sort=oldest&title=desc&page=7$/);
  await expect(active).toBeFocused();
  await expect(active).toHaveText('7');
  await page.goBack();
  await expect(active).toHaveText('8');
  await expect(active).toBeFocused();
  const search = page.getByRole('searchbox', { name: 'Search resources...' });
  await search.focus();
  await page.goForward();
  await expect(active).toHaveText('7');
  await expect(search).toBeFocused();
  await active.focus();
  await page.goBack();
  await expect(active).toHaveText('8');
  await expect(active).toBeFocused();
  await nav.getByRole('button', { name: 'Last page', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(nav.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(nav.getByRole('button', { name: 'Last page', exact: true })).toBeDisabled();
  await expect(active).toHaveText(String(pages));
  await expect(active).toBeFocused();
  await page.reload();
  await expect(active).toHaveText(String(pages));
  await nav.getByRole('button', { name: 'First page', exact: true }).click();
  await expect(page).toHaveURL(/\?sort=oldest&title=desc$/);
  await expect(nav.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await expect(nav.getByRole('button', { name: 'First page', exact: true })).toBeDisabled();
  await expect(active).toHaveText('1');
  await expect(active).toBeFocused();
  for (const width of [320, 390, 600, 768]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await nav.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const label of ['First page', 'Last page']) {
      const icon = nav.getByRole('button', { name: label, exact: true }).locator('span');
      await expect(icon).toBeVisible();
      expect(await icon.evaluate((element) => getComputedStyle(element).maskImage)).toContain('data:image/svg+xml');
    }
  }
  await openFacet(page, 'type');
  await page.getByRole('checkbox', { name: 'Quickstart', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(page).not.toHaveURL(/page=/);
  await page.getByRole('searchbox', { name: 'Search resources...' }).fill('no-such-resource-555');
  await expect(nav).toBeHidden();
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`pagination scrolls to the breadcrumb with ${reducedMotion} motion without losing keyboard focus`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/hub/browse/?page=2');
    await page.evaluate(() => {
      const scrollIntoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (this.matches('.breadcrumb') && typeof options === 'object' && options.behavior) {
          this.setAttribute('data-pagination-scroll', options.behavior);
        }
        scrollIntoView.call(this, options);
      };
    });
    const nav = page.getByRole('navigation', { name: 'Resource pages' });
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
    const pages = Math.ceil(await page.locator('.browse-result').count() / 24);
    const expectBreadcrumbAtTop = async () => {
      await expect(breadcrumb).toHaveAttribute('data-pagination-scroll', reducedMotion === 'reduce' ? 'instant' : 'smooth');
      await expect(breadcrumb).toBeInViewport();
      await expect.poll(() => breadcrumb.evaluate((element) => {
        const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
        return Math.abs(element.getBoundingClientRect().top - offset);
      })).toBeLessThanOrEqual(1);
      const header = (await page.locator('header.header').boundingBox())!;
      expect((await breadcrumb.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height);
    };
    for (const [name, targetPage] of [
      ['Next', 3], ['Previous', 2], ['Page 3', 3], ['First page', 1], ['Last page', pages],
    ] as const) {
      await nav.scrollIntoViewIfNeeded();
      const control = nav.getByRole('button', { name, exact: true });
      await expect(control).toBeInViewport();
      await control.click();
      await expect(page).toHaveURL(targetPage === 1 ? /\/hub\/browse\/$/ : new RegExp(`page=${targetPage}$`));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expectBreadcrumbAtTop();
      await expect(['Next', 'Previous'].includes(name) ? control : nav.locator('[aria-current="page"]')).toBeFocused();
    }
    const previous = nav.getByRole('button', { name: 'Previous', exact: true });
    await previous.focus();
    await expect(previous).toBeInViewport();
    await previous.press('Enter');
    await expect(previous).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`page=${pages - 1}$`));
    await expectBreadcrumbAtTop();
  });
}

test('language icons show article coverage opposite the type badge in both themes', async ({ page }) => {
  await page.goto('/hub/browse/?q=connect%20openai');
  const card = results(page).filter({ has: page.locator('a[href="/integrations/ai/openai/openai-connect/"]') });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('link')).toHaveAccessibleDescription('Languages: C#, Go, Python, TypeScript');
    const badges = card.locator('[data-resource-language]');
    expect(await badges.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-resource-language'))))
      .toEqual(['csharp', 'go', 'python', 'typescript']);
    const kind = await card.locator('.browse-card-kind').boundingBox();
    const preview = await card.locator('.browse-card-preview').boundingBox();
    for (const badge of await badges.all()) {
      await expect(badge).toBeVisible();
      const image = badge.locator('img');
      await image.evaluate((element: HTMLImageElement) => element.decode());
      expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
      const box = await badge.boundingBox();
      expect(box!.x).toBeGreaterThan(kind!.x + kind!.width);
      expect(box!.x + box!.width).toBeLessThan(preview!.x + preview!.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(preview!.y + preview!.height);
    }
  }
});

test('filters and cards remain accessible in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/hub/browse/?type=sample');
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    await expect(results(page).first()).toBeVisible();
    for (const name of ['language', 'sort']) {
      await openFacet(page, name);
      const scan = await new AxeBuilder({ page }).include('resource-browser').analyze();
      expect(scan.violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator(`[data-filter-group="${name}"] summary`)).toBeFocused();
    }
  }
});

test('all resource destinations remain available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/hub/browse/`);
  expect(await page.locator('.browse-result a').count()).toBeGreaterThan(100);
  await expect(page.getByText('All resources are listed below.', { exact: false })).toBeVisible();
  await expect(page.locator('.browse-search')).toBeHidden();
  await expect(page.locator('.browse-filters')).toBeHidden();
  await expect(page.locator('.browse-loading')).toBeHidden();
  await expect(page.locator('.browse-result').last()).toBeVisible();
  await context.close();
});
