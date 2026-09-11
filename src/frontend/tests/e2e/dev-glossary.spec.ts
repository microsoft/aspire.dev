import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('new glossary concepts are searchable and have linked pages and Markdown', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [slug, title, query] of [
    ['ats', 'Aspire Type System', 'ATS'],
    ['endpoint', 'Endpoint', 'Endpoint'],
    ['parameter', 'Parameter', 'external parameter'],
    ['resource-lifetime', 'Resource lifetime', 'Resource lifetime'],
    ['deployment-pipeline', 'Deployment pipeline', 'Deployment pipeline'],
    ['compute-environment', 'Compute environment', 'Compute environment'],
    ['otlp', 'OpenTelemetry Protocol', 'OTLP'],
    ['resource-command', 'Resource command', 'Resource command'],
  ]) {
    await page.goto('/dev/glossary/');
    await page.getByRole('searchbox', { name: 'Find a term' }).fill(query);
    const card = page.locator('[data-glossary-card]:visible')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(card).toHaveCount(1);
    await card.getByRole('link', { name: `Read the full definition of ${title}` }).click();
    await expect(page).toHaveURL(new RegExp(`/dev/glossary/${slug}/`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByRole('complementary', { name: 'Related terms' })).toBeVisible();
    const markdown = await page.request.get(`/dev/glossary/${slug}.md`);
    expect(markdown.status()).toBe(200);
    expect(await markdown.text()).toContain(`# ${title}`);
  }
  await page.goto('/dev/glossary/apphost/');
  await page.locator('.term-body').getByRole('link', { name: 'Aspire Type System (ATS)' }).click();
  await expect(page).toHaveURL(/\/dev\/glossary\/ats\/$/);
});

test('topic filter colors retain contrast across selection and theme changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/glossary/');
  const chips = page.locator('.api-filter-chip[data-colored]');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      for (const selected of [true, false]) {
        for (const chip of await chips.all()) {
          await chip.click();
          await expect(chip).toHaveAttribute('aria-pressed', String(selected));
          await expect(chip).toHaveCSS('transition-duration', '0s');
        }
        await chips.first().hover();
        await chips.first().focus();
        const result = await new AxeBuilder({ page })
          .include('.inpage-kind-filters')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(result.violations).toEqual([]);
      }
    }
  }
});

test('glossary toolbar keeps search compact and every letter reachable in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/glossary/');
  const alphabet = page.getByRole('navigation', { name: 'Glossary letters' });
  const heading = page.getByRole('heading', { name: 'Aspire glossary', level: 1 });
  await expect(heading.locator('svg')).toBeVisible();
  await expect(heading.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(heading).toHaveCSS('display', 'flex');
  await expect(page.getByRole('searchbox', { name: 'Find a term' })).toHaveAttribute('placeholder', 'Search glossary');
  await expect(page.locator('.dev-description')).toHaveText('Search for a term, or filter by topic and first letter.');
  const label = page.locator('label[for="glossary-search-input"]');
  await expect(label).toHaveCSS('clip-path', 'inset(50%)');
  for (const width of [320, 390, 768, 1024, 1199, 1200, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const titleBox = (await heading.boundingBox())!;
    const breadcrumbBox = (await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).boundingBox())!;
    const introductionBox = (await page.locator('.dev-description').boundingBox())!;
    expect(breadcrumbBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
    expect(introductionBox.y).toBeGreaterThanOrEqual(breadcrumbBox.y + breadcrumbBox.height);
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
      for (const button of await page.locator('.glossary-controls [data-kind]').all()) {
        await expect(button).toHaveCSS('border-top-style', 'solid');
        await expect(button).toHaveCSS('border-top-width', '1px');
        expect(await button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      }
      const bounds = (await alphabet.boundingBox())!;
      expect(await alphabet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(alphabet.locator(':scope > a, :scope > span')).toHaveCount(27);
      for (const item of await alphabet.locator(':scope > a, :scope > span').all()) {
        const letter = (await item.boundingBox())!;
        expect(letter.x).toBeGreaterThanOrEqual(bounds.x);
        expect(letter.x + letter.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
        expect(letter.width).toBeGreaterThanOrEqual(24);
        expect(letter.height).toBeGreaterThanOrEqual(width <= 600 ? 44 : 36);
      }
      const search = (await page.getByRole('searchbox', { name: 'Find a term' }).boundingBox())!;
      expect(search.width).toBeLessThanOrEqual(512);
      expect(search.height).toBe(44);
      const topics = (await page.locator('#glossary-kind-filters').boundingBox())!;
      const stats = (await page.locator('.glossary-controls .inpage-search-stats').boundingBox())!;
      if (width >= 1200) {
        expect(search.width).toBeGreaterThanOrEqual(256);
        expect(topics.x).toBeGreaterThanOrEqual(stats.x + stats.width);
        expect(stats.x).toBeGreaterThanOrEqual(search.x + search.width);
        expect(topics.y + topics.height / 2).toBeCloseTo(search.y + search.height / 2, 0);
        expect(topics.x + topics.width).toBeCloseTo(bounds.x + bounds.width, 0);
      } else {
        expect(topics.y).toBeGreaterThanOrEqual(search.y + search.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).include('.glossary-controls').include('.glossary-alphabet')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations).toEqual([]);
    }
  }
  await expect(page.locator('#glossary-search-count')).toHaveText('40 terms');
  await page.getByRole('button', { name: 'Reference', exact: true }).press('Space');
  await alphabet.getByRole('link', { name: 'W', exact: true }).press('Enter');
  await expect(alphabet.getByRole('link', { name: 'W', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#glossary-search-count')).toHaveText('5 of 40 terms');
  await expect(page.locator('#glossary-search-status')).toHaveText('5 of 40 terms: Reference, letter W');
  for (const width of [1200, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const search = (await page.getByRole('searchbox', { name: 'Find a term' }).boundingBox())!;
    const stats = (await page.locator('.glossary-controls .inpage-search-stats').boundingBox())!;
    const topics = (await page.locator('#glossary-kind-filters').boundingBox())!;
    expect(search.width).toBeGreaterThanOrEqual(256);
    expect(stats.x).toBeGreaterThanOrEqual(search.x + search.width);
    expect(topics.x).toBeGreaterThanOrEqual(stats.x + stats.width);
    expect(topics.y + topics.height / 2).toBeCloseTo(search.y + search.height / 2, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Clear filters', exact: true }).press('Enter');
  await expect(page.getByRole('searchbox', { name: 'Find a term' })).toBeFocused();
  await expect(alphabet.getByRole('link', { name: 'All', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-glossary-card]:visible')).toHaveCount(40);
});

test('topic selection keeps the search input and filter buttons stationary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 640, 1200, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.goto('/dev/glossary/');
      await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
      await page.evaluate(() => document.fonts.ready);
      const controls = page.locator('.glossary-controls input, .glossary-controls [data-kind]');
      const geometry = () => controls.evaluateAll((elements) => elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height, weight: getComputedStyle(element).fontWeight };
      }));
      const initial = await geometry();
      for (const selected of [true, false]) {
        for (const button of await page.locator('.glossary-controls [data-kind]').all()) {
          await button.click();
          await expect(button).toHaveAttribute('aria-pressed', String(selected));
          expect(await geometry(), `${width}px ${theme}: ${await button.innerText()}`).toEqual(initial);
        }
      }
      await page.getByRole('button', { name: 'Reference', exact: true }).click();
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      expect(await geometry()).toEqual(initial);
    }
  }
});

test('searches aliases, definitions, and context with combined letter/topic filters', async ({ page }) => {
  await page.goto('/dev/glossary/');
  const search = page.getByRole('searchbox', { name: 'Find a term' });
  const cards = page.locator('[data-glossary-card]:visible');
  await expect(cards).toHaveCount(40);
  await search.fill('OTEL');
  await expect(page.locator('[data-glossary-card]:visible h3')).toContainText(['OpenTelemetry']);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await search.fill('configured readiness');
  await expect(page.locator('[data-glossary-card]:visible h3')).toContainText(['WaitFor']);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Reference', exact: true }).click();
  await page.getByRole('navigation', { name: 'Glossary letters' }).getByRole('link', { name: 'W', exact: true }).click();
  await expect(cards).toHaveCount(5);
  await expect(page).toHaveURL(/topic=reference&letter=W/);
  await search.fill('no-such-term');
  await expect(page.getByRole('heading', { name: 'No matching terms' })).toBeVisible();
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show all terms', exact: true }).click();
  await expect(cards).toHaveCount(40);
  await expect(search).toBeFocused();
});

test('empty results stay compact and offer one reset action in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/glossary/?q=abd&topic=reference&letter=W');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const empty = page.locator('[data-glossary-empty]');
      await expect(empty).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeHidden();
      const bounds = (await empty.boundingBox())!;
      const alphabet = (await page.locator('.glossary-alphabet').boundingBox())!;
      expect(bounds.y - (alphabet.y + alphabet.height)).toBeLessThanOrEqual(16);
      expect(bounds.height).toBeLessThan(width >= 768 ? 160 : 240);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).include('glossary-browser').analyze();
      expect(result.violations).toEqual([]);
    }
  }
  await page.getByRole('button', { name: 'Show all terms', exact: true }).press('Enter');
  await expect(page.getByRole('searchbox', { name: 'Find a term' })).toBeFocused();
  await expect(page.locator('[data-glossary-card]:visible')).toHaveCount(40);
  await expect(page).toHaveURL(/\/dev\/glossary\/$/);
  await expect(page.locator('[data-glossary-empty]')).toBeHidden();
});

test('restores filters on reload and Back, and supports keyboard return to the same results', async ({ page }) => {
  await page.goto('/dev/glossary/?q=wait&topic=reference&letter=W');
  await expect(page.locator('[data-glossary-card]:visible')).toHaveCount(4);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('wait');
  await page.getByRole('button', { name: 'Foundations', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Reference', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Foundations', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('heading', { name: 'WaitFor', exact: true }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'WaitFor', exact: true })).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  const collapsedBreadcrumb = page.locator('.bc-collapse summary');
  if (await collapsedBreadcrumb.isVisible()) await collapsedBreadcrumb.press('Enter');
  await page.getByRole('link', { name: 'Back to your glossary results' }).press('Enter');
  await expect(page.getByRole('searchbox')).toHaveValue('wait');
  await expect(page.locator('[data-glossary-card]:visible')).toHaveCount(4);
});

test('supports accessible in-card previews without layout shifts, with pinning and dismissal', async ({ page }, testInfo) => {
  await page.goto('/dev/glossary/?q=AppHost&letter=A');
  const card = page.locator('[data-glossary-card]').filter({ has: page.getByRole('heading', { name: 'AppHost', exact: true }) });
  const button = card.getByRole('button', { name: /^(In practice|Show definition)\s*:\s*AppHost$/ });
  const panel = card.locator('[data-context-panel]');
  const definition = card.getByRole('link', { name: 'Read the full definition of AppHost' });
  await page.evaluate(() => document.fonts.ready);
  const height = await card.evaluate((element) => element.getBoundingClientRect().height);
  await expect(button).toHaveAttribute('aria-controls', 'context-apphost');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await expect(panel).toHaveAttribute('inert', '');
  await expect(definition).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(card).toHaveAttribute('data-preview', 'true');
  await expect(card).toHaveAttribute('data-pinned', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute('aria-hidden', 'true');
  await expect(panel).not.toHaveAttribute('inert', '');
  await expect(panel.getByRole('link')).toHaveCount(0);
  await expect(definition).toBeVisible();
  expect(await card.evaluate((element) => element.getBoundingClientRect().height)).toBe(height);
  const bounds = await card.boundingBox();
  const panelBounds = await panel.boundingBox();
  expect(panelBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(panelBounds!.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(card).toHaveAttribute('data-preview', 'false');
  await expect(panel).toBeHidden();
  await button.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await button.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.press('Space');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('searchbox').click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  if (testInfo.project.name === 'desktop-chromium') {
    await button.hover();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await panel.hover();
    await expect(panel).toBeVisible();
    await page.getByRole('searchbox').hover();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.focus();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  } else {
    await button.click();
    await expect(panel).toHaveCSS('position', 'static');
  }
  expect(await card.evaluate((element) => element.getBoundingClientRect().height)).toBe(height);
  await expect(definition).toBeVisible();
});

test('uses page actions without duplicate sharing controls on term pages', async ({ page }) => {
  await page.goto('/dev/glossary/withreference/?from=%2Fdev%2Fglossary%2F%3Fq%3Dwait');
  for (const name of ['Copy Markdown', 'Open', 'Share']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('glossary-permalink, .term-sharing')).toHaveCount(0);
  await expect(page.locator('.term-reading').getByRole('link', { name: 'Permalink', exact: true })).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/dev\/glossary\/withreference\/$/);
});

test('term pages use the article heading, actions, divider and breadcrumb layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const term of ['apphost', 'resourcenotificationservice']) {
    await page.goto(`/dev/glossary/${term}/`);
    const panels = page.locator('main > .content-panel');
    await expect(panels).toHaveCount(2);
    const header = panels.first();
    const content = panels.nth(1);
    await expect(header.locator('h1#_top')).toHaveCount(1);
    await expect(header.locator('.actions-container')).toHaveCount(1);
    await expect(header.locator('.breadcrumb, .term-description')).toHaveCount(0);
    await expect(content.locator('.dev-breadcrumbs')).toBeVisible();
    await expect(content.locator('.term-description')).toBeVisible();
    await expect(page.locator('main .hero')).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
      const heading = (await header.locator('h1#_top').boundingBox())!;
      const actions = (await header.locator('.actions-container').boundingBox())!;
      const body = (await content.boundingBox())!;
      const breadcrumbs = (await content.locator('.dev-breadcrumbs').boundingBox())!;
      const description = (await content.locator('.term-description').boundingBox())!;
      expect(actions.y).toBeGreaterThanOrEqual(heading.y + heading.height);
      expect(body.y).toBeGreaterThanOrEqual(actions.y + actions.height);
      expect(breadcrumbs.y).toBeGreaterThanOrEqual(body.y);
      expect(description.y).toBeGreaterThanOrEqual(breadcrumbs.y + breadcrumbs.height);
      expect(await content.evaluate((element) => parseFloat(getComputedStyle(element).borderTopWidth))).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(header.getByText('Share on LinkedIn', { exact: true })).toBeVisible();
    await header.getByText('Share on LinkedIn', { exact: true }).click({ trial: true });
    await page.keyboard.press('Escape');
  }
});

test('static glossary compatibility HTML preserves bookmarked fragments and query strings', async ({ page, request }) => {
  const response = await request.get('/get-started/glossary/', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).not.toMatch(/http-equiv=["']refresh["']/i);
  // Replay HTML without an HTTP redirect, matching static hosting behavior.
  await page.route('**/get-started/glossary/**', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: html,
  }));
  for (const anchor of ['polyglot', 'apis-and-patterns', 'execution-modes', 'api-reference-terms', 'see-also']) {
    await page.goto(`/get-started/glossary/#${anchor}`);
    await expect(page).toHaveURL(new RegExp(`/dev/glossary/#${anchor}$`));
    await expect(page.locator(`[id="${anchor}"]`)).toHaveCount(1);
    await expect(page.locator(`[id="${anchor}"]`)).toBeInViewport();
  }
  await page.goto('/get-started/glossary/?q=withreference#withreference');
  await expect(page).toHaveURL(/\/dev\/glossary\/\?q=withreference#withreference$/);
  await expect(page.locator('#glossary-search-input')).toHaveValue('withreference');
  await expect(page.locator('#withreference')).toBeInViewport();
});

test('old glossary bookmarks retain usable definition links without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/get-started/glossary/#withreference');
  await expect(page).toHaveURL(/\/get-started\/glossary\/#withreference$/);
  await expect(page.locator('#withreference')).toBeVisible();
  for (const id of [
    'apphost', 'resource', 'distributed-application', 'service-defaults', 'polyglot', 'withreference',
    'waitfor', 'waitforcompletion', 'waitforstart', 'connection-string', 'service-discovery',
    'health-check', 'environment-variable', 'hosting-integration', 'client-integration',
    'the-relationship', 'run-mode', 'publish-mode', 'aspire-dashboard', 'opentelemetry',
    'emulator-pattern', 'existing-resource-pattern',
    'core-concepts', 'apis-and-patterns', 'key-terms', 'resource-types', 'execution-modes',
    'dashboard-and-observability', 'common-patterns', 'api-reference-terms', 'see-also',
  ]) await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://aspire.dev/dev/glossary/');
  await expect(page.locator('#withreference')).toBeInViewport();
  await expect(page.locator('#withreference').getByRole('link', { name: 'WithReference', exact: true }))
    .toHaveAttribute('href', '/dev/glossary/withreference/');
  await page.locator('#withreference').getByRole('link', { name: 'WithReference', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'WithReference', exact: true })).toBeVisible();
  await page.goto('/dev/glossary/');
  await expect(page.locator('[data-glossary-card]')).toHaveCount(40);
  await expect(page.locator('[data-glossary-card]').first().locator('.glossary-noscript-context')).toBeVisible();
  await page.getByRole('link', { name: 'Read the full definition of AppHost' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'AppHost', exact: true })).toBeVisible();
  await context.close();
});

test('glossary cards keep bounded widths beneath keyboard-focusable letter controls in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/glossary/');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const grid = page.locator('.glossary-grid').first();
      const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').filter((column) => parseFloat(column) > 0).length);
      expect(columns).toBe(width > 1100 ? 3 : width >= 768 ? 2 : 1);
      const cards = grid.locator('[data-glossary-card]');
      const first = (await cards.first().boundingBox())!;
      const last = (await cards.last().boundingBox())!;
      const bounds = (await grid.boundingBox())!;
      expect(first.width).toBeLessThanOrEqual(bounds.width / columns);
      expect(last.width).toBeCloseTo(first.width, 0);
      if (width >= 768) {
        const firstRowLast = (await cards.nth(Math.min(columns, await cards.count()) - 1).boundingBox())!;
        expect(first.y).toBeCloseTo(firstRowLast.y, 0);
      }
      if (width === 1440) {
        expect(first.height).toBeLessThan(320);
        expect(first.y + first.height).toBeLessThan(900);
      }
      const letter = page.locator('.glossary-group h2').first();
      const letterBounds = (await letter.boundingBox())!;
      expect(letterBounds.y + letterBounds.height).toBeLessThan(first.y);
      expect(letterBounds.x).toBeCloseTo(first.x, 0);
      const letterLink = page.getByRole('navigation', { name: 'Glossary letters' }).getByRole('link', { name: 'A', exact: true });
      await letterLink.focus();
      await expect(letterLink).toHaveCSS('outline-style', 'solid');
      expect(await letterLink.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
      await expect(cards.first().locator('.glossary-card-heading')).toHaveCSS('display', 'grid');
      await expect(cards.first().getByRole('button')).toHaveCSS('border-width', '1px');
      await expect(cards.first().locator('.glossary-card-footer')).toHaveCSS('border-top-width', '0px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.getByRole('searchbox', { name: 'Find a term' }).fill('OTEL');
  const result = page.locator('[data-glossary-card]:visible');
  await expect(result).toHaveCount(1);
  const cardWidth = (await result.boundingBox())!.width;
  const gridWidth = (await page.locator('.glossary-group:visible .glossary-grid').boundingBox())!.width;
  expect(cardWidth).toBeLessThanOrEqual(gridWidth / 3);
});

test('has accessible controls and no horizontal overflow', async ({ page }) => {
  await page.goto('/dev/glossary/');
  const result = await new AxeBuilder({ page }).include('glossary-browser').analyze();
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/dev/glossary/resourcenotificationservice/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('term pages show LearnMore directly below always-visible practical examples', async ({ page }) => {
  await page.goto('/dev/glossary/apphost/');
  await expect(page.getByRole('complementary', { name: 'Continue learning' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Next step', exact: true })).toHaveCount(0);
  const learning = page.locator('.term-main .term-learn-more .learn-more');
  await expect(learning.getByRole('link')).toHaveCount(1);
  await expect(learning.getByRole('link')).toHaveAttribute('href', '/get-started/app-host/');
  await expect(learning.getByRole('link')).toContainText('Define your application with an AppHost');
  const example = page.getByRole('region', { name: 'Practical example', exact: true });
  await expect(example.locator('details, summary, button')).toHaveCount(0);
  await expect(example.locator('p')).toBeVisible();
  await expect(page.locator('.term-example + .term-learn-more .learn-more')).toBeVisible();
  const exampleBox = (await example.boundingBox())!;
  const learningBox = (await learning.boundingBox())!;
  expect(learningBox.y).toBeGreaterThanOrEqual(exampleBox.y + exampleBox.height);
  expect(learningBox.y - exampleBox.y - exampleBox.height).toBeLessThanOrEqual(32);
  const related = page.getByRole('complementary', { name: 'Related terms' });
  await expect(related).toBeVisible();
  for (const link of await related.getByRole('link').all()) {
    await expect(link.locator('.related-term-summary')).not.toBeEmpty();
  }
  await page.goto('/dev/glossary/otlp/');
  await expect(learning.getByRole('link')).toHaveCount(2);
  await expect(learning.getByRole('link').nth(0)).toHaveAttribute('href', '/fundamentals/telemetry/#export-opentelemetry-data-for-monitoring');
  await expect(learning.getByRole('link').nth(1)).toHaveAttribute('href', '/dashboard/configuration/#otlp');
});

test('optional glossary metadata is readable and preserved in Markdown', async ({ page }) => {
  const cases = [
    { id: 'apphost', type: 'Concept', pronunciation: undefined },
    { id: 'dag', type: 'Concept', pronunciation: 'dag (rhymes with bag)' },
    { id: 'otlp', type: 'Protocol', pronunciation: 'O-T-L-P (OTLP)' },
    { id: 'waitforcompletion', type: 'API method', pronunciation: undefined },
    { id: 'polyglot', type: undefined, pronunciation: undefined },
  ];
  const directoryMarkdown = await (await page.request.get('/dev/glossary.md')).text();
  for (const entry of cases) {
    await page.goto(`/dev/glossary/${entry.id}/`);
    const metadata = page.locator('.term-meta');
    await expect(metadata).toHaveCount(entry.type || entry.pronunciation ? 1 : 0);
    const response = await page.request.get(`/dev/glossary/${entry.id}.md`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/markdown');
    const markdown = await response.text();
    if (entry.type) {
      await expect(metadata).toContainText(entry.type);
      expect(markdown).toContain(`Term type: ${entry.type}`);
      expect(directoryMarkdown).toContain(`Term type: ${entry.type}`);
    } else expect(markdown).not.toContain('Term type:');
    if (entry.pronunciation) {
      await expect(metadata).toContainText(entry.pronunciation);
      expect(markdown).toContain(`Pronounced: ${entry.pronunciation}`);
      expect(directoryMarkdown).toContain(`Pronounced: ${entry.pronunciation}`);
    } else {
      await expect(metadata.getByText('Pronounced', { exact: true })).toHaveCount(0);
      expect(markdown).not.toContain('Pronounced:');
    }
    expect(markdown).toContain('## Practical example');
    expect(markdown).toContain('## Learn more');
    expect(markdown).not.toContain('## Next step');
    for (const link of await page.locator('.term-learn-more a').all()) {
      expect(markdown).toContain(`https://aspire.dev${await link.getAttribute('href')}`);
    }
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (entry.type) {
        const heading = (await page.locator('#term-definition-heading').boundingBox())!;
        const meta = (await metadata.boundingBox())!;
        const definition = (await page.locator('.term-description').boundingBox())!;
        expect(meta.y).toBeGreaterThanOrEqual(heading.y + heading.height);
        expect(definition.y).toBeGreaterThanOrEqual(meta.y + meta.height);
      }
      const result = await new AxeBuilder({ page }).include('.term-definition')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations).toEqual([]);
    }
  }
});

test('term definitions, aliases and examples have a readable hierarchy in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/glossary/waitforcompletion/');
  const definition = page.getByRole('region', { name: 'Definition', exact: true });
  await expect(definition.locator('.term-description')).toContainText('exits with the expected exit code');
  await expect(definition.locator('.term-aliases dt')).toHaveText('Also known as');
  await expect(definition.locator('.term-aliases dd')).toHaveText('waitForCompletion, completion dependency');
  const example = page.getByRole('region', { name: 'Practical example', exact: true });
  await expect(example.locator('p')).toHaveText('Run a database migration resource to completion before starting the API that depends on the updated schema.');
  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const introduction = (await definition.boundingBox())!;
    const explanation = (await page.locator('.term-body').boundingBox())!;
    expect(explanation.y).toBeGreaterThan(introduction.y + introduction.height);
    const result = await new AxeBuilder({ page }).include('.term-reading')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  }
});

test('term definitions and practical examples remain visible without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/dev/glossary/waitforcompletion/');
    await expect(page.getByRole('region', { name: 'Definition', exact: true }).locator('p')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Practical example', exact: true }).locator('p')).toBeVisible();
    await expect(page.locator('.term-example details')).toHaveCount(0);
    await expect(page.locator('.term-meta')).toContainText('API method');
    await expect(page.locator('.term-example + .term-learn-more .learn-more a')).toBeVisible();
    await expect(page.locator('.pagination-links a[rel="prev"]')).toBeVisible();
    await expect(page.locator('.pagination-links a[rel="next"]')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('term navigation follows glossary order after the reading content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/glossary/');
  const terms = await page.locator('[data-glossary-card] h3 a').evaluateAll((links) =>
    links.map((link) => ({ href: new URL(link.getAttribute('href')!, location.href).pathname, title: link.textContent! })));
  expect(terms.length).toBeGreaterThan(2);
  for (const index of [0, Math.floor(terms.length / 2), terms.length - 1]) {
    await page.goto(terms[index].href);
    const navigation = page.locator('.pagination-links');
    const previous = navigation.locator('a[rel="prev"]');
    const next = navigation.locator('a[rel="next"]');
    if (index === 0) await expect(previous).toHaveCount(0);
    else {
      await expect(previous).toHaveAttribute('href', terms[index - 1].href);
      await expect(previous.locator('.link-title')).toHaveText(terms[index - 1].title);
    }
    if (index === terms.length - 1) await expect(next).toHaveCount(0);
    else {
      await expect(next).toHaveAttribute('href', terms[index + 1].href);
      await expect(next.locator('.link-title')).toHaveText(terms[index + 1].title);
    }
    await navigation.scrollIntoViewIfNeeded();
    const reading = (await page.locator('.term-reading').boundingBox())!;
    const nav = (await navigation.boundingBox())!;
    expect(nav.y).toBeGreaterThanOrEqual(reading.y + reading.height);
    expect(nav.y - reading.y - reading.height).toBeLessThanOrEqual(80);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('previous and next terms preserve the return to filtered glossary results', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const from = '/dev/glossary/?q=wait&topic=reference';
  await page.goto(`/dev/glossary/waitforcompletion/?from=${encodeURIComponent(from)}`);
  await page.locator('.pagination-links a[rel="next"]').click();
  await expect(page.locator('h1#_top')).toHaveText('WaitForStart');
  expect(new URL(page.url()).searchParams.get('from')).toBe(from);
  await page.locator('.pagination-links a[rel="prev"]').click();
  await expect(page.locator('h1#_top')).toHaveText('WaitForCompletion');
  expect(new URL(page.url()).searchParams.get('from')).toBe(from);
  const collapsedBreadcrumb = page.locator('.bc-collapse summary');
  if (await collapsedBreadcrumb.isVisible()) await collapsedBreadcrumb.click();
  await page.getByRole('link', { name: 'Back to your glossary results' }).click();
  await expect(page).toHaveURL(new RegExp('/dev/glossary/\\?q=wait&topic=reference$'));
  await expect(page.getByRole('searchbox')).toHaveValue('wait');
});

test('glossary inline code inherits the shared documentation prose styles', async ({ page }) => {
  const inlineStyle = (element: Element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      font: style.fontFamily,
      size: style.fontSize,
      padding: style.padding,
      radius: style.borderRadius,
      border: style.borderWidth,
      whitespace: style.whiteSpace,
      wrap: style.overflowWrap,
    };
  };
  for (const theme of ['light', 'dark']) {
    await page.goto('/fundamentals/service-discovery/');
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    const expected = await page.locator('.sl-markdown-content p > code').first().evaluate(inlineStyle);
    await page.goto('/dev/glossary/withreference/');
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    const code = page.locator('.term-body p > code').first();
    expect(await code.evaluate(inlineStyle)).toEqual(expected);
    expect(await code.evaluate((element) => element.closest('.not-content') === null)).toBe(true);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('term pages place related terms beside the reading column on tablets and desktops', async ({ page }) => {
  for (const route of ['/dev/glossary/withreference/', '/dev/glossary/resourcenotificationservice/']) {
    await page.goto(route);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
        const main = (await page.locator('.term-main').boundingBox())!;
        const related = (await page.locator('.term-related').boundingBox())!;
        await expect(page.locator('.term-related')).toHaveCSS('border-radius', '0px');
        const learning = (await page.locator('.term-learn-more').boundingBox())!;
        expect(learning.width).toBeCloseTo(main.width, 0);
        expect(main.width).toBeLessThanOrEqual(736);
        if (width >= 768) {
          expect(related.x).toBeGreaterThan(main.x + main.width);
          expect(related.y).toBeCloseTo(main.y, 0);
        } else {
          expect(related.y).toBeGreaterThan(main.y + main.height);
          expect(related.x).toBeCloseTo(main.x, 0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width}px ${theme}`).toBe(true);
      }
    }
  }
});

test('topic pills support multiple selections, keyboard toggling, and persistent return links', async ({ page }) => {
  await page.goto('/dev/glossary/');
  const cards = page.locator('[data-glossary-card]:visible');
  const expected = await cards.evaluateAll((elements) => elements.filter((element) =>
    element.getAttribute('data-topics')?.split(' ').some((topic) => ['foundations', 'reference'].includes(topic))).length);
  const reference = page.getByRole('button', { name: 'Reference', exact: true });
  const foundations = page.getByRole('button', { name: 'Foundations', exact: true });
  await reference.press('Space');
  await foundations.press('Enter');
  await expect(reference).toHaveAttribute('aria-pressed', 'true');
  await expect(foundations).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(expected);
  expect(new URL(page.url()).searchParams.getAll('topic')).toEqual(['foundations', 'reference']);
  await page.reload();
  await expect(cards).toHaveCount(expected);
  await expect(reference).toHaveClass(/active/);
  await expect(foundations).toHaveClass(/active/);
  const search = page.getByRole('searchbox', { name: 'Find a term' });
  await search.fill('apphost');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(cards).toHaveCount(expected);
  await expect(foundations).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Read the full definition of AppHost' }).click();
  const collapsed = page.locator('.bc-collapse summary');
  if (await collapsed.isVisible()) await collapsed.press('Enter');
  await page.getByRole('link', { name: 'Back to your glossary results' }).press('Enter');
  await expect(cards).toHaveCount(expected);
  await expect(reference).toHaveAttribute('aria-pressed', 'true');
  await expect(foundations).toHaveAttribute('aria-pressed', 'true');
  await foundations.press('Space');
  await expect(foundations).toHaveAttribute('aria-pressed', 'false');
  await expect(reference).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).press('Enter');
  await expect(cards).toHaveCount(40);
  await expect(search).toBeFocused();
  await expect(reference).toHaveAttribute('aria-pressed', 'false');
});
