import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('production Dev Hub scripts, styles, and Pagefind load from static assets', async ({ page, request }) => {
  const pagefind = await request.get('/pagefind/pagefind.js');
  test.skip(!process.env.CI && !pagefind.ok(), 'Requires the production static-site artifact.');
  expect(pagefind.ok()).toBe(true);
  const errors: string[] = [];
  const assetTypes = new Set<string>();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const type = response.request().resourceType();
    if (!['script', 'stylesheet'].includes(type) || new URL(response.url()).origin !== new URL(page.url()).origin) return;
    assetTypes.add(type);
    if (!response.ok() && response.status() !== 304) errors.push(`${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', (failed) => {
    if (['script', 'stylesheet'].includes(failed.resourceType()) && new URL(failed.url()).origin === new URL(page.url()).origin) {
      errors.push(`${failed.failure()?.errorText}: ${failed.url()}`);
    }
  });
  for (const route of ['/hub/', '/hub/browse/', '/hub/glossary/', '/hub/glossary/apphost/']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(await response!.text()).not.toContain('/@vite/client');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (route === '/hub/browse/') await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
    if (route === '/hub/glossary/') await expect(page.getByRole('searchbox', { name: 'Find a term' })).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  await page.goto('/hub/');
  await page.getByRole('button', { name: 'Search Aspire documentation' }).click();
  const dialog = page.locator('site-search dialog');
  await dialog.locator('input.pagefind-ui__search-input').fill('AppHost');
  await expect(dialog.locator('.pagefind-ui__result-link').first()).toBeVisible();
  await expect(dialog.locator('.pagefind-ui__result-link[href^="/dev/"]')).toHaveCount(0);
  // Index membership must not depend on the first page's ranking for a broad query.
  const indexedPaths = await page.evaluate(async () => {
    const pagefind = (await import(
      /* @vite-ignore */ `${window.location.origin}/pagefind/pagefind.js`
    )) as {
      search: (query: string) => Promise<{
        results: Array<{ data: () => Promise<{ url: string }> }>;
      }>;
    };
    const response = await pagefind.search('"The AppHost runs alongside your services"');
    return Promise.all(response.results.map(async (result) =>
      new URL((await result.data()).url, window.location.origin).pathname));
  });
  expect(indexedPaths).toContain('/hub/glossary/apphost/');
  expect(indexedPaths.some((path) => path.startsWith('/dev/'))).toBe(false);
  const sitemapIndex = await request.get('/sitemap-index.xml');
  expect(sitemapIndex.ok()).toBe(true);
  const sitemapPaths = [...(await sitemapIndex.text()).matchAll(/<loc>([^<]+)<\/loc>/g)];
  expect(sitemapPaths.length).toBeGreaterThan(0);
  const sitemapPages = (await Promise.all(sitemapPaths.map(async ([, url]) => {
    const response = await request.get(new URL(url).pathname);
    expect(response.ok()).toBe(true);
    return response.text();
  }))).join('\n');
  expect(sitemapPages).toContain('https://aspire.dev/hub/glossary/apphost/');
  expect(sitemapPages).not.toContain('https://aspire.dev/dev/');
  expect(assetTypes.has('script')).toBe(true);
  expect(assetTypes.has('stylesheet')).toBe(true);
  expect(errors).toEqual([]);
});

test('custom destinations excluded from the Markdown validator exist with their bookmark targets', async ({ page, request }) => {
  for (const [route, title] of [
    ['/hub/', 'Dev Hub'],
    ['/hub/glossary/ats/', 'Aspire Type System'],
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
  }
  const legacy = await request.get('/get-started/glossary/');
  expect(legacy.status()).toBe(200);
  const html = await legacy.text();
  expect(html).toContain('id="polyglot"');
  expect(html).toContain('href="/hub/glossary/polyglot/"');
  await page.goto('/get-started/glossary/#polyglot');
  await expect(page).toHaveURL(/\/hub\/glossary\/#polyglot$/);
  await expect(page.locator('#polyglot')).toHaveCount(1);
});

test('onboarding offers native task links with visible focus in both themes and accessibility modes', async ({ page }) => {
  await page.goto('/hub/');
  const section = page.getByRole('region', { name: 'New to Aspire?' });
  const links = section.getByRole('link');
  await expect(links).toHaveCount(4);
  await expect(section.locator('.resource-card, .resource-icon')).toHaveCount(0);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      for (const reducedMotion of ['reduce', 'no-preference'] as const) {
        await page.emulateMedia({ reducedMotion });
        for (const link of await links.all()) {
          await link.focus();
          await expect(link).toBeFocused();
          await expect(link).toHaveCSS('outline-style', 'solid');
          expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          await expect(link).toHaveCSS('animation-name', 'none');
          if (reducedMotion === 'reduce') {
            for (const icon of await link.locator('svg').all()) await expect(icon).toHaveCSS('transition-duration', '0s');
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      const hoverRow = links.nth(1);
      await page.mouse.move(0, 0);
      const restingBackground = await hoverRow.evaluate((element) => getComputedStyle(element).backgroundColor);
      const restingIcon = (await hoverRow.locator('.onboarding-option-icon svg').boundingBox())!;
      await hoverRow.hover();
      await expect(hoverRow).not.toHaveCSS('background-color', restingBackground);
      await expect(hoverRow).not.toHaveCSS('box-shadow', 'none');
      await expect.poll(async () => (await hoverRow.locator('.onboarding-option-icon svg').boundingBox())!.x).toBeCloseTo(restingIcon.x, 0);
      const hoverResult = await new AxeBuilder({ page }).include('.onboarding').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(hoverResult.violations).toEqual([]);
      await page.mouse.move(0, 0);
      const result = await new AxeBuilder({ page }).include('.onboarding').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations).toEqual([]);
    }
  }
  await page.emulateMedia({ forcedColors: 'active' });
  for (const link of await links.all()) {
    await expect(link).toHaveCSS('forced-color-adjust', 'auto');
    await link.focus();
    await expect(link).toHaveCSS('outline-style', 'solid');
  }
  await expect(section.locator('.onboarding-recommended')).toHaveCSS('border-width', '1px');
  await expect(links.first()).toHaveAttribute('href', '/get-started/first-app/');
  await links.first().press('Enter');
  await expect(page).toHaveURL((url) =>
    url.pathname === '/get-started/first-app/' && url.searchParams.get('aspire-lang') === 'typescript');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Build your first Aspire app');
  await expect(page.locator('#pivot-selector-aspire-lang [data-pivot-option="typescript"]')).toHaveClass(/\bactive\b/);
});

test('Dev Hub introduction and Markdown omit repository positioning copy', async ({ page, request }) => {
  const description = 'Aspire is the tool for code-first, extensible, observable dev and deploy.';
  await page.goto('/hub/');
  await expect(page.locator('.hub-intro')).not.toContainText(description);
  const markdown = await request.get('/hub.md');
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).not.toContain(description);
  await expect(page.locator('a[href="https://github.com/dotnet/aspire"]')).toHaveCount(0);
  await page.goto('/community/contributors/');
  await expect(page.getByRole('link', { name: 'microsoft/aspire', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'microsoft/aspire', exact: true })).toHaveAttribute('href', 'https://github.com/microsoft/aspire');
  await expect(page.getByRole('link', { name: 'dotnet/aspire', exact: true })).toHaveCount(0);
});

test('Dev Hub links share animated underlines and topic cards use the concept-card hover treatment', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/hub/');
  await expect(page.locator('.dev-home a:not(.dashboard-links a):not([data-underline-trigger])')).toHaveCount(0);
  for (const link of await page.locator('.dev-home a:not(.dashboard-links a)').all()) {
    await expect(link.locator('[data-link-underline]')).toHaveCount(1);
  }
  for (const selector of ['.dev-browse-link', '.onboarding-options a', '.topic-links a', '.language-links a', '.cloud-links a', '.featured-samples a', '.reference-links a', '.dashboard-previews a', '.channel-link', '.video-links a', '.blog-links a']) {
    const link = page.locator(selector).first();
    const underline = link.locator('[data-link-underline]');
    await link.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect.poll(() => underline.evaluate((el) => getComputedStyle(el, '::after').transform)).toBe('matrix(0, 0, 0, 1, 0, 0)');
    await link.hover();
    await expect.poll(() => underline.evaluate((el) => getComputedStyle(el, '::after').transform)).toBe('matrix(1, 0, 0, 1, 0, 0)');
    expect(await underline.evaluate((el) => getComputedStyle(el, '::after').transitionDuration)).toBe('0.36s');
    expect(await underline.evaluate((el) => getComputedStyle(el, '::after').transformOrigin)).toMatch(/^0px /);
    await expect(link).not.toHaveCSS('text-decoration-line', 'underline');
  }
  const card = page.locator('.topic-links a').first();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    await page.mouse.move(0, 0);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveCSS('transform', 'none');
    const background = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    await card.hover();
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)');
    await expect(card.locator('.topic-icon')).toHaveCSS('transform', 'matrix(1.08, 0, 0, 1.08, 0, 0)');
    await expect(card).not.toHaveCSS('background-color', background);
    const results = await new AxeBuilder({ page }).include('.topic-links').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  }
  await page.mouse.move(0, 0);
  await card.focus();
  await expect(card).toHaveCSS('outline-style', 'solid');
  await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(card).toHaveCSS('transform', 'none');
  await expect(card.locator('.topic-icon')).toHaveCSS('transform', 'none');
  expect(await card.locator('[data-link-underline]').evaluate((el) => getComputedStyle(el, '::after').transitionDuration)).toBe('0s');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(card.locator('[data-link-underline]')).toHaveCSS('text-decoration-line', 'underline');
});

test('dashboard shortcut buttons use background hover and focus without underlines', async ({ page }) => {
  await page.goto('/hub/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const shortcuts = page.locator('.dashboard-links a');
  await expect(shortcuts).toHaveCount(5);
  await expect(shortcuts.locator('[data-link-underline]')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    for (const link of await shortcuts.all()) {
      await link.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const background = await link.evaluate((el) => getComputedStyle(el).backgroundColor);
      await link.hover();
      await expect(link).not.toHaveCSS('background-color', background);
      await expect(link).toHaveCSS('text-decoration-line', 'none');
      await expect(link.locator('span')).toHaveCSS('text-decoration-line', 'none');
      expect(await link.locator('span').evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
      await page.mouse.move(0, 0);
      await link.focus();
      await expect(link).toHaveCSS('outline-style', 'solid');
      await expect(link).not.toHaveCSS('background-color', background);
      await link.evaluate((el) => el.blur());
    }
  }
});

test('directory pages share title, full-width divider, breadcrumb, and content order', async ({ page }) => {
  for (const route of ['/hub/', '/hub/browse/', '/hub/glossary/']) {
    await page.goto(route);
    const panels = page.locator('main > .content-panel');
    const header = panels.nth(0);
    const content = panels.nth(1);
    await expect(panels).toHaveCount(2);
    await expect(header.locator('h1')).toHaveCount(1);
    await expect(header.locator('.breadcrumb, .dev-description, .actions-container')).toHaveCount(0);
    await expect(page.locator('main .hero')).toHaveCount(0);
    await expect(content).toHaveCSS('border-top-width', '1px');
    if (route === '/hub/browse/') {
      await expect(header.locator('h1')).toHaveText('Browse resources');
      await expect(content.locator('.breadcrumb')).toContainText('Resources');
      await expect(content.locator('.breadcrumb')).not.toContainText('Browse resources');
    }
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
        const heading = (await header.locator('h1').boundingBox())!;
        const titlePanel = (await header.boundingBox())!;
        const bodyPanel = (await content.boundingBox())!;
        const breadcrumb = (await content.locator('.breadcrumb').boundingBox())!;
        expect(heading.y + heading.height).toBeLessThan(bodyPanel.y);
        expect(bodyPanel.x).toBe(titlePanel.x);
        expect(bodyPanel.width).toBe(titlePanel.width);
        expect(breadcrumb.y - bodyPanel.y).toBeGreaterThanOrEqual(24);
        expect(breadcrumb.x).toBeCloseTo(heading.x, 0);
        const body = content.locator(route === '/hub/' ? '.dev-discovery' : route === '/hub/browse/' ? 'resource-browser' : 'glossary-browser');
        expect((await body.boundingBox())!.y).toBeGreaterThanOrEqual(breadcrumb.y + breadcrumb.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  }
});

test('Pagefind includes every glossary entry but excludes Dev Hub directory pages', async ({ page, request }) => {
  for (const route of ['/hub/', '/hub/browse/', '/hub/glossary/']) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toMatch(/<main\b[^>]*\bdata-pagefind-body\b/);
  }
  await page.goto('/hub/glossary/');
  const termLinks = page.locator('[data-term-link]');
  await expect(termLinks.first()).toBeAttached();
  const termPaths = await termLinks.evaluateAll((links) =>
    [...new Set(links.map((link) => new URL(link.getAttribute('href')!, window.location.origin).pathname))]
      .filter((path) => /^\/hub\/glossary\/[^/]+\/$/.test(path)));
  expect(termPaths.length).toBeGreaterThan(0);
  for (const path of termPaths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).toMatch(/<main\b[^>]*\bdata-pagefind-body\b/);
  }
});

test('Developer Hub links directly to existing resources and the latest featured videos', async ({ page }) => {
  await page.goto('/hub/');
  const links = page.getByRole('region', { name: 'New to Aspire?' }).getByRole('link');
  const destinations = [
    '/get-started/first-app/', '/get-started/add-aspire-existing-app/',
    '/get-started/deploy-first-app/', '/hub/glossary/',
  ];
  await expect(links).toHaveCount(destinations.length);
  for (const [index, href] of destinations.entries()) {
    await expect(links.nth(index)).toHaveAttribute('href', href);
    expect((await page.request.get(href)).status()).toBe(200);
  }
  const videos = page.getByRole('region', { name: 'Latest from Aspire on YouTube' });
  await expect(videos.getByRole('link', { name: 'Aspire Bytes: withReference and withEnvironment' }))
    .toHaveAttribute('href', 'https://www.youtube.com/watch?v=1D4PQiW3eqg');
  await expect(videos.getByRole('link', { name: 'Aspire 13.5 is here!' }))
    .toHaveAttribute('href', 'https://www.youtube.com/watch?v=pEbo-qKif1U');
});

test('mobile language rows give icons a stable inset and text gap', async ({ page }) => {
  await page.goto('/hub/');
  for (const width of [320, 390, 767, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    const rows = page.locator('.language-links > li > a');
    const cloudIcon = width < 768 ? (await page.locator('.cloud-links img').first().boundingBox())! : undefined;
    if (cloudIcon) {
      const firstLanguageIcon = (await rows.first().locator(':scope > .language-devicon, :scope > img.language-rust-icon').boundingBox())!;
      expect(Math.abs(firstLanguageIcon.x - cloudIcon.x)).toBeLessThanOrEqual(1);
    }
    for (const row of await rows.all()) {
      const geometry = await row.evaluate((link) => {
        const icon = link.querySelector<HTMLElement>(':scope > .language-devicon, :scope > img.language-rust-icon')!;
        const text = link.querySelector<HTMLElement>(':scope > div')!;
        const rowBox = link.getBoundingClientRect();
        const iconBox = icon.getBoundingClientRect();
        const textBox = text.getBoundingClientRect();
        return {
          inset: iconBox.left - rowBox.left,
          gap: textBox.left - iconBox.right,
          overflow: link.scrollWidth > link.clientWidth,
        };
      });
      expect(geometry.overflow).toBe(false);
      expect(geometry.inset).toBeCloseTo(width < 768 ? 16 : 0, 0);
      expect(geometry.gap).toBeCloseTo(width < 768 ? 20 : 16, 0);
    }
  }
});

test('newcomer paths precede three-column topic cards with responsive layouts', async ({ page }) => {
  await page.goto('/hub/');
  const newcomers = page.getByRole('region', { name: 'New to Aspire?' });
  const topics = page.getByRole('navigation', { name: 'Browse by topic' });
  const intro = page.getByRole('region', { name: 'Find resources and get started' });
  await expect(intro.locator('.dev-description')).toHaveText('Find guides, working samples, and reference docs for your next Aspire app.');
  await expect(intro).toContainText('Search Aspire documentation');
  await expect(intro).toContainText('New to Aspire?');
  await expect(newcomers.locator('.onboarding-option-icon')).toHaveCount(4);
  await expect(newcomers.locator('[data-recommended]')).toHaveCount(1);
  await expect(newcomers.getByRole('heading', { level: 3 })).toHaveText(['Create your first app', 'Add Aspire to your project', 'Deploy your app', 'Understand the concepts']);
  await expect(newcomers.locator('.onboarding-format')).toHaveText(['Quickstart', 'How-to', 'Tutorial', 'Glossary']);
  const descriptions = await newcomers.locator('.onboarding-options p').allTextContents();
  await expect(topics.getByRole('link')).toHaveCount(6);
  const markdown = await (await page.request.get('/hub.md')).text();
  expect(markdown.indexOf('## New to Aspire?')).toBeLessThan(markdown.indexOf('## Browse by topic'));
  expect(markdown).toContain(await intro.locator('.dev-description').innerText());
  for (const description of descriptions) expect(markdown).toContain(description);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const search = (await page.getByRole('button', { name: 'Search Aspire documentation' }).boundingBox())!;
    const resourceBrowser = (await page.getByRole('link', { name: 'Browse all resources' }).boundingBox())!;
    const start = (await newcomers.boundingBox())!;
    const browse = (await topics.boundingBox())!;
    const introBox = (await intro.boundingBox())!;
    expect(search.y).toBeGreaterThan(introBox.y);
    expect(resourceBrowser.y).toBeGreaterThanOrEqual(search.y + search.height);
    expect(resourceBrowser.x).toBeCloseTo(search.x, 0);
    expect(start.y).toBeGreaterThan(search.y + search.height);
    expect(start.y + start.height).toBeLessThanOrEqual(introBox.y + introBox.height);
    expect(start.y + start.height).toBeLessThan(browse.y);
    const columns = await topics.locator('ul').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width >= 1024 ? 3 : width >= 640 ? 2 : 1);
    const optionColumns = await newcomers.locator('ul').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(optionColumns).toBe(1);
    const primary = (await newcomers.getByRole('link').first().boundingBox())!;
    const existingProject = (await newcomers.getByRole('link').nth(1).boundingBox())!;
    const glossary = (await newcomers.getByRole('link').last().boundingBox())!;
    expect(primary.x).toBeCloseTo(existingProject.x, 0);
    expect(primary.width).toBeCloseTo(existingProject.width, 0);
    expect(primary.y + primary.height).toBeLessThanOrEqual(existingProject.y);
    expect(existingProject.y + existingProject.height).toBeLessThan(glossary.y);
    for (const link of await newcomers.getByRole('link').all()) await expect(link).toHaveCSS('border-width', '0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const starter = newcomers.getByRole('link').first();
  await expect(starter).toContainText('Create your first app');
  await starter.focus();
  await expect(starter).toBeFocused();
  await expect(starter).not.toHaveCSS('outline-style', 'none');
  expect(await starter.evaluate((element) => parseFloat(getComputedStyle(element).outlineOffset))).toBeGreaterThanOrEqual(3);
  await starter.hover();
  for (const element of [starter, starter.locator('[data-link-underline]')]) {
    await expect(element).toHaveCSS('text-decoration-line', 'none');
  }
  const first = topics.getByRole('link').first();
  await first.focus();
  await expect(first).toBeFocused();
  await expect(first).not.toHaveCSS('outline-style', 'none');
  await first.press('Enter');
  await expect(page).toHaveURL(/\/docs\/$/);
});

test('Dev Hub uses consistent heading, body, and action sizes across viewports', async ({ page }) => {
  await page.goto('/hub/');
  const title = page.getByRole('heading', { level: 1, name: 'Dev Hub', exact: true });
  await expect(title.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(await title.locator('svg').innerHTML()).toBe(
    await page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true }).locator('svg').innerHTML(),
  );
  for (const width of [320, 390, 768, 1440, 2000]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('main h1')).toHaveCSS('font-size', width < 1000 ? '32px' : '40px');
    const icon = (await title.locator('svg').boundingBox())!;
    const label = (await title.locator('span').boundingBox())!;
    expect(icon.width).toBeGreaterThan(24);
    expect(icon.x + icon.width).toBeLessThan(label.x);
    expect(icon.y + icon.height / 2).toBeCloseTo(label.y + label.height / 2, 0);
    for (const heading of await page.locator('.dev-home h3').all()) {
      await expect(heading).toHaveCSS('font-size', '18px');
    }
    for (const body of await page.locator('.topic-links p, .onboarding p, .language-links p, .sample-copy p, .cloud-links p, .reference-links p, .blog-copy p, .dashboard-previews figcaption p, .topic-action').all()) {
      await expect(body).toHaveCSS('font-size', '16px');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('sample previews reserve their loaded proportions before images arrive', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/_image/**', (route) => route.abort());
    await page.goto('/hub/');
    const cards = page.locator('.featured-samples > li');
    const reserved = await cards.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    await page.unroute('**/_image/**');
    await page.reload();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      for (const image of await cards.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      }
      const loaded = await cards.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
      for (const [index, height] of loaded.entries()) {
        expect(Math.abs(height - reserved[index])).toBeLessThan(2);
      }
    }
  }
});

test('mobile section headings keep browse links inline when they fit', async ({ page }) => {
  await page.goto('/hub/');
  for (const width of [320, 390, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    const heading = page.locator('.section-heading').filter({ has: page.locator('#samples-heading') });
    const title = (await heading.getByRole('heading').boundingBox())!;
    const link = (await heading.getByRole('link').boundingBox())!;
    if (width >= 390) {
      expect(Math.abs(title.y + title.height / 2 - link.y - link.height / 2)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('desktop header actions use consistent spacing', async ({ page }) => {
  await page.goto('/hub/');
  for (const width of [1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const banner = page.getByRole('banner');
    const hubLink = banner.getByRole('link', { name: 'Dev Hub', exact: true });
    await expect(hubLink).toHaveAttribute('aria-label', 'Dev Hub');
    await expect(hubLink).toHaveAttribute('aria-current', 'page');
    await expect(hubLink.locator('svg')).toBeVisible();
    await expect(hubLink).toHaveCSS('border-width', '1px');
    await expect(hubLink).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const dev = (await hubLink.boundingBox())!;
    expect(dev.width).toBeCloseTo(dev.height, 0);
    const install = (await banner.getByRole('button', { name: 'Open install Aspire CLI dialog', exact: true }).boundingBox())!;
    expect(dev.width).toBeCloseTo(install.width, 0);
    expect(dev.height).toBeCloseTo(install.height, 0);
    const hubIcon = (await hubLink.locator('svg').boundingBox())!;
    expect(hubIcon.width).toBeCloseTo(20, 0);
    expect(hubIcon.height).toBeCloseTo(20, 0);
    const docs = (await banner.getByRole('link', { name: 'Docs', exact: true }).boundingBox())!;
    const videos = (await banner.locator('.live-btn:visible').boundingBox())!;
    const start = (await banner.getByRole('link', { name: 'Try Aspire', exact: true }).boundingBox())!;
    expect(videos.x - install.x - install.width).toBeCloseTo(8, 0);
    expect(dev.x - videos.x - videos.width).toBeCloseTo(8, 0);
    expect(docs.x - dev.x - dev.width).toBeCloseTo(8, 0);
    expect(start.x - docs.x - docs.width).toBeCloseTo(8, 0);
  }
  await page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Dev Hub');
});

test('mobile header controls share an inactive border in both themes', async ({ page }) => {
  await page.goto('/reference/samples/');
  const banner = page.getByRole('banner');
  const hub = banner.getByRole('link', { name: 'Dev Hub', exact: true });
  for (const width of [320, 640, 799]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((html, value) => html.dataset.theme = value, theme);
      await expect(hub).not.toHaveAttribute('aria-current');
      await expect(hub).toHaveCSS('border-width', '1px');
      await expect(hub).toHaveCSS('border-style', 'solid');
      await expect(hub).toHaveCSS('border-radius', '6px');
      const borderColor = await hub.evaluate((element) => getComputedStyle(element).borderColor);
      for (const control of [
        banner.locator('button[data-open-modal]:visible'),
        banner.locator('.live-btn:visible'),
        page.locator('starlight-menu-button button'),
      ]) {
        await expect(control).toHaveCSS('border-width', '1px');
        await expect(control).toHaveCSS('border-style', 'solid');
        await expect(control).toHaveCSS('border-color', borderColor);
        await expect(control).toHaveCSS('border-radius', '6px');
      }
    }
  }
});

test('header icon order and Videos selected effect survive client navigation', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/hub/');
    await page.evaluate((value) => {
      localStorage.setItem('starlight-theme', value);
      document.documentElement.dataset.theme = value;
    }, theme);
    const hub = page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true });
    const videos = page.locator('header .live-btn:visible');
    const selectedStyle = await hub.evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor, radius: style.borderRadius };
    });
    await expect(videos).not.toHaveAttribute('aria-current');
    for (const group of ['.right-group', '.right-group-mobile']) {
      await expect(page.locator(`header ${group} > .header-icon-btn`).nth(0)).toHaveClass(/install-cli-btn/);
      await expect(page.locator(`header ${group} > .header-icon-btn`).nth(1)).toHaveClass(/live-btn/);
      await expect(page.locator(`header ${group} > .header-icon-btn`).nth(2)).toHaveClass(/dev-center-btn/);
      await expect(page.locator(`header ${group} > .header-icon-btn`).nth(3)).toHaveClass(/cookie-consent-btn/);
    }
    const hubBox = (await hub.boundingBox())!;
    const videoBox = (await videos.boundingBox())!;
    expect(hubBox.x - videoBox.x - videoBox.width).toBeCloseTo(8, 0);
    await videos.click();
    await expect(page).toHaveURL(/\/community\/videos\/$/);
    await expect(videos).toHaveAttribute('aria-current', 'page');
    await expect(hub).not.toHaveAttribute('aria-current');
    await expect(videos).toHaveCSS('color', selectedStyle.color);
    await expect(videos).toHaveCSS('background-color', selectedStyle.background);
    await expect(videos).toHaveCSS('border-radius', selectedStyle.radius);
    await page.keyboard.press('Tab');
    await videos.focus();
    await expect(videos).toHaveCSS('outline-style', 'solid');
    await expect(videos).toHaveCSS('color', 'rgb(31, 30, 51)');
    await hub.click();
    await expect(page).toHaveURL(/\/hub\/$/);
    await expect(hub).toHaveAttribute('aria-current', 'page');
    await expect(videos).not.toHaveAttribute('aria-current');
  }
});

test('Dev Hub has a distinct active header button on hub and browse routes in both themes', async ({ page }) => {
  for (const route of ['/hub/', '/hub/browse/', '/']) {
    await page.goto(route);
    const hub = page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true });
    for (const theme of ['light', 'dark']) {
      await page.mouse.move(0, 0);
      await hub.evaluate((element) => element.blur());
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const foreground = await hub.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--sl-color-text)';
        element.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      await expect(page.locator('header .site-title span')).toHaveCSS('color', foreground);
      for (const control of await page.locator('header :is(.header-icon-btn, .docs-btn, .docs-btn-mobile, site-search > button[data-open-modal]):visible').all()) {
        const expectedColor = await control.getAttribute('aria-current') === 'page' ? 'rgb(31, 30, 51)' : foreground;
        await expect(control).toHaveCSS('color', expectedColor);
        await control.hover();
        await expect(control).toHaveCSS('color', expectedColor);
        await control.focus();
        await expect(control).toHaveCSS('color', expectedColor);
        await control.evaluate((element) => element.blur());
      }
      await page.mouse.move(0, 0);
      await expect(hub).toBeVisible();
      if (route === '/') {
        await expect(hub).not.toHaveAttribute('aria-current');
        const borderWidth = await page.locator('header .live-btn:visible')
          .evaluate((element) => getComputedStyle(element).borderWidth);
        await expect(hub).toHaveCSS('border-width', borderWidth);
        await expect(hub).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      } else {
        await expect(hub).toHaveAttribute('aria-current', 'page');
        await expect(hub).toHaveCSS('border-width', '1px');
        await expect(hub).toHaveCSS('border-radius', '8px');
        await expect(hub).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        const colors = await hub.evaluate((element) => {
          const style = getComputedStyle(element);
          return { foreground: style.color, background: style.backgroundColor };
        });
        expect(colors.foreground).not.toBe(colors.background);
        expect(colors.foreground).toBe('rgb(31, 30, 51)');
        if (theme === 'light') {
          expect(colors.background).toBe('rgb(213, 210, 246)');
          expect(colors.foreground).toBe(foreground);
        }
        await hub.focus();
        await expect(hub).not.toHaveCSS('outline-style', 'none');
        await hub.hover();
        await expect(hub).toHaveCSS('opacity', '1');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      if (theme === 'light') {
        for (const control of await page.locator('header :is(.dev-center-btn, .dev-center-btn-mobile, .install-cli-btn):visible').all()) {
          await control.hover();
          await expect(control).toHaveCSS('background-color', 'rgb(213, 210, 246)');
          await expect(control).toHaveCSS('color', foreground);
          await control.focus();
          await expect(control).toHaveCSS('outline-style', 'solid');
          await control.evaluate((element) => element.blur());
        }
      }
    }
  }
});

test('Developer Hub dashboard screenshots load and its links reach real sections', async ({ page }) => {
  await page.goto('/hub/#dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dev Hub');
  const dashboard = page.getByRole('region', { name: 'Dashboard', exact: true });
  const screenshots = dashboard.locator('img');
  await expect(screenshots).toHaveCount(2);
  for (const image of await screenshots.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  const links = await dashboard.locator('a[href]').evaluateAll((elements) => elements.map((element) => element.getAttribute('href')!));
  expect(links).toHaveLength(8);
  for (const href of links) {
    const response = await page.goto(href);
    if (response) expect(response.status()).toBe(200);
    const hash = new URL(page.url()).hash;
    if (hash) await expect(page.locator(hash)).toBeVisible();
  }
});

test('discovery arrows, dashboard panels, and video links stay aligned at every breakpoint', async ({ page }) => {
  await page.goto('/hub/');
  for (const width of [320, 390, 640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const layout = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.onboarding-options a')];
        const panels = [...document.querySelectorAll('.dashboard-previews figure')];
        const videos = [...document.querySelectorAll('.video-links a')];
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          arrowInsets: cards.map((card) => card.getBoundingClientRect().right - card.querySelector(':scope > svg')!.getBoundingClientRect().right),
          panels: panels.map((panel) => {
            const rect = panel.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, captionTop: panel.querySelector('figcaption')!.getBoundingClientRect().top };
          }),
          links: [...document.querySelectorAll('#dashboard a, .channel-link')].map((link) => ({
            fontSize: parseFloat(getComputedStyle(link).fontSize),
            height: link.getBoundingClientRect().height,
          })),
          videos: videos.map((video) => {
            const title = video.querySelector('h3')!;
            const icon = title.querySelector('svg')!.getBoundingClientRect();
            return {
              marker: getComputedStyle(video, '::after').content,
              iconOffset: icon.top - title.getBoundingClientRect().top,
              lineHeight: parseFloat(getComputedStyle(title).lineHeight),
            };
          }),
        };
      });
      expect(layout.overflow, `${width}px ${theme}`).toBe(false);
      expect(Math.max(...layout.arrowInsets) - Math.min(...layout.arrowInsets)).toBeLessThan(1);
      expect(layout.links.every((link) => link.fontSize >= 16 && link.height >= 44)).toBe(true);
      const [first, second] = layout.panels;
      if (width >= 768) {
        expect(Math.abs(first.top - second.top)).toBeLessThan(1);
        expect(Math.abs(first.captionTop - second.captionTop)).toBeLessThan(1);
      } else {
        expect(first.bottom).toBeLessThan(second.top);
        expect(first.left).toBe(second.left);
        expect(first.right).toBe(second.right);
      }
      for (const video of layout.videos) {
        expect(video.marker).toBe('none');
        expect(video.iconOffset).toBeGreaterThanOrEqual(0);
        expect(video.iconOffset).toBeLessThan(video.lineHeight);
      }
    }
  }
});

test('Developer Hub typography and glossary controls reflow in both themes', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'Explicit widths are covered by the desktop project.');
  for (const width of [320, 390, 640, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.goto('/hub/glossary/');
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const layout = await page.evaluate(() => {
        const heading = getComputedStyle(document.querySelector('main h1')!);
        const pills = [...document.querySelectorAll<HTMLElement>('#glossary-kind-filters button')];
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          headingSize: parseFloat(heading.fontSize),
          hasTagline: Boolean(document.querySelector('.dev-description')?.textContent?.trim()),
          pillHeights: pills.map((pill) => pill.getBoundingClientRect().height),
          searchClass: document.querySelector('glossary-browser input')?.className,
        };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.headingSize).toBeGreaterThanOrEqual(32);
      expect(layout.hasTagline).toBe(false);
      expect(layout.pillHeights.every((height) => height >= (width <= 600 ? 44 : 36))).toBe(true);
      expect(layout.searchClass).toContain('inpage-search-input');
      await expect(page.locator('glossary-browser select')).toHaveCount(0);
      await expect(page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true })).toBeVisible();
    }
  }
});

test('Developer Hub and glossary emit canonical metadata without filter parameters', async ({ page }) => {
  for (const [route, canonical] of [
    ['/hub/', '/hub/'],
    ['/hub/browse/?q=redis&type=integration', '/hub/browse/'],
    ['/hub/glossary/?topic=foundations', '/hub/glossary/'],
    ['/hub/glossary/apphost/?from=%2Fhub%2Fglossary%2F', '/hub/glossary/apphost/'],
    ['/get-started/glossary/#apphost', '/hub/glossary/'],
  ]) {
    await page.goto(route);
    const canonicalLink = page.locator('link[rel="canonical"]');
    await expect(canonicalLink).toHaveCount(1);
    await expect(canonicalLink).toHaveAttribute('href', `https://aspire.dev${canonical}`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `https://aspire.dev${canonical}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    for (const schema of await page.locator('script[type="application/ld+json"]').allTextContents()) {
      expect(schema).not.toContain('https://aspire.dev/dev/');
    }
    await expect(page.locator('a[href^="/dev/"]')).toHaveCount(0);
  }
});

test('unpublished dev routes do not duplicate the canonical hub pages or Markdown', async ({ request }) => {
  for (const route of ['/dev/', '/dev/browse/', '/dev/glossary/', '/dev/glossary/apphost/', '/dev.md', '/dev/glossary.md', '/dev/glossary/apphost.md']) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(404);
  }
  for (const route of ['/hub.md', '/hub/glossary.md', '/hub/glossary/apphost.md']) {
    const response = await request.get(route);
    expect(response.ok(), route).toBe(true);
    const markdown = await response.text();
    expect(markdown).toContain('https://aspire.dev/hub/');
    expect(markdown).not.toContain('https://aspire.dev/dev/');
    expect(markdown).not.toMatch(/\]\(\/dev\//);
  }
});

test('localized navigation keeps the English Developer Hub destination', async ({ page }) => {
  await page.goto('/de/docs/');
  const link = page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/hub/');
});

test('the hub and glossary retain accessible light and dark layouts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/hub/', '/hub/glossary/', '/hub/glossary/?topic=foundations&topic=reference', '/hub/glossary/apphost/']) {
    await page.goto(route);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const result = await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(result.violations).toEqual([]);
    }
  }
});

test('browsing pages omit page actions while keeping their Markdown endpoints', async ({ page }) => {
  for (const [route, heading] of [
    ['/hub/', 'Dev Hub'],
    ['/hub/glossary/', 'Aspire glossary'],
  ]) {
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.locator('main .actions-container')).toHaveCount(0);
      for (const name of ['Copy Markdown', 'Open', 'Share']) {
        await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
      }
    }
    const response = await page.request.get(`${route.slice(0, -1)}.md`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/markdown');
    expect(await response.text()).toContain(`# ${heading}`);
  }
});

test('glossary term page actions copy real Markdown and expose Open and Share menus', async ({ page }) => {
  for (const [route, heading] of [
    ['/hub/glossary/apphost/', '# AppHost'],
  ]) {
    await page.goto(route);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text; } },
      });
    });
    const response = await page.request.get(`${route.slice(0, -1)}.md`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/markdown');
    expect(await response.text()).toContain(heading);
    await page.getByRole('button', { name: 'Copy Markdown', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-copied', new RegExp(heading));
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('link', { name: 'View in Markdown' })).toHaveAttribute('href', `${route.slice(0, -1)}.md`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.locator('.actions-container').getByRole('link', { name: /LinkedIn/ })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('page-action menus stay within narrow viewports on glossary term pages', async ({ page }) => {
  for (const width of [320, 390, 640]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/hub/glossary/apphost/']) {
      await page.goto(route);
      const actions = page.locator('main .actions-container');
      await expect(actions).toBeVisible();
      for (const name of ['Open', 'Share']) {
        await actions.getByRole('button', { name, exact: true }).click();
        const menu = actions.locator('[id="dropdown-menu"].show');
        await expect(menu).toBeVisible();
        const bounds = await menu.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.getByRole('heading', { level: 1 }).click();
        await expect(menu).toHaveCount(0);
      }
    }
  }
});

test('Developer Hub opens site search without filtering the page and retains keyboard shortcuts', async ({ page }) => {
  await page.goto('/hub/');
  const trigger = page.getByRole('button', { name: 'Search Aspire documentation' });
  const dialog = page.locator('site-search dialog');
  await expect(page.locator('site-search')).toHaveCount(1);
  await expect(page.getByRole('banner').locator('button[data-open-modal]')).toBeHidden();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(dialog).toBeVisible();
  const input = dialog.locator('input.pagefind-ui__search-input');
  const devWarning = dialog.getByText(/Search is only available in production builds/i);
  await expect(input.or(devWarning)).toBeVisible();
  if (await input.isVisible()) {
    await expect(input).toBeFocused();
    await input.fill('redis');
    await expect(dialog.locator('.pagefind-ui__result-link').first()).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  for (const key of ['Enter', 'Space', 'Control+k', 'Meta+k']) {
    await trigger.press(key);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await expect(page.getByRole('region', { name: 'New to Aspire?' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Browse by topic' })).toBeVisible();
  await expect(page.locator('.dev-home [hidden], .dev-home input, .dev-empty')).toHaveCount(0);
  await expect(page).toHaveURL(/\/hub\/$/);
  await page.goto('/hub/glossary/');
  await expect(page.getByRole('banner').locator('button[data-open-modal]')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Find a term' })).toBeVisible();
});

test('discovery cards have working destinations, images, icons, colors, and matching Markdown', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/hub/');
  await expect(page.locator('.hero > img')).toHaveCount(0);
  const topicDestinations = await page.getByRole('navigation', { name: 'Browse by topic' }).locator('a')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('href')));
  expect(topicDestinations).toEqual([
    '/docs/', '/integrations/', '/dashboard/', '/deployment/', '/reference/overview/', '/community/',
  ]);
  const markdown = await (await page.request.get('/hub.md')).text();
  await expect(page.locator('.featured-samples h3')).toHaveText([
    'Aspire Shop', 'Angular, React, and Vue', 'FastAPI + JavaScript',
    'Go REST API', 'Persistent Volume', 'Node.js Weather Explorer',
  ]);
  const links = await page.locator('.topic-links a, .language-links a, .featured-samples a, .reference-section a')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('href')!));
  for (const href of new Set(links)) {
    expect(markdown).toContain(href);
    if (href.startsWith('#')) {
      await expect(page.locator(href)).toHaveCount(1);
    } else {
      expect((await page.request.get(href)).status(), href).toBe(200);
    }
  }
  for (const image of await page.locator('.featured-samples img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(page.locator('.language-devicon')).toHaveCount(5);
  const icons = await page.locator('.language-devicon').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundImage));
  expect(icons.every((icon) => icon !== 'none')).toBe(true);
  await expect(page.locator('.language-rust-icon')).toHaveCount(1);
  await expect(page.locator('.onboarding-option-icon')).toHaveCount(4);
  await expect(page.locator('.onboarding-option-icon svg')).toHaveCount(4);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    const accent = await page.locator('.dev-browse-link').evaluate((element) => getComputedStyle(element).color);
    const starterColors = await page.locator('.onboarding-option-icon').evaluateAll((elements) =>
      elements.map((element) => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor })));
    expect(starterColors.map(({ color }) => color)).toEqual(Array(4).fill(accent));
    expect(new Set(starterColors.map(({ background }) => background)).size).toBe(1);
    expect(starterColors[0].background).not.toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('.language-rust-icon')).toHaveCSS('filter', theme === 'dark' ? 'invert(1)' : 'none');
    await expect.poll(() => page.locator('.language-rust-icon').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const colors = await page.locator('.topic-links a').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
    expect(new Set(colors).size).toBe(6);
  }
});

test('cloud and blog discovery stays readable and responsive', async ({ page }) => {
  await page.goto('/hub/');
  const clouds = page.getByRole('region', { name: 'Browse by cloud' });
  await expect(clouds.getByRole('heading', { level: 3 })).toHaveText(['AWS', 'Azure', 'Kubernetes']);
  expect(await clouds.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual([
    '/integrations/cloud/aws/overview/',
    '/integrations/cloud/azure/overview/',
    '/deployment/kubernetes/',
  ]);
  const blog = page.getByRole('region', { name: 'From the blog' });
  await expect(blog.locator('.blog-links li')).toHaveCount(3);
  expect(await blog.locator('time').evaluateAll((dates) => dates.map((date) => date.getAttribute('datetime'))))
    .toEqual(['2026-08-18', '2026-06-16', '2026-06-09']);
  const markdown = await (await page.request.get('/hub.md')).text();
  for (const href of await page.locator('.cloud-links a, .blog-links a').evaluateAll((links) => links.map((link) => link.getAttribute('href')!))) {
    expect(markdown).toContain(href);
    if (href.startsWith('/')) expect((await page.request.get(href)).status()).toBe(200);
  }
  for (const image of await page.locator('.cloud-links img, .blog-links img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
  }
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${theme}`).toBe(true);
      const layout = await page.locator('.reference-links a, .cloud-links a, .blog-links a').evaluateAll((links) => links.map((link) => ({
        marker: getComputedStyle(link, '::after').content,
        fontSize: parseFloat(getComputedStyle(link.querySelector('h3')!).fontSize),
        bounds: link.getBoundingClientRect().width,
      })));
      expect(layout.every((link) => link.marker === 'none' && link.fontSize >= 16 && link.bounds > 0)).toBe(true);
      for (const frame of await page.locator('.sample-preview img, .dashboard-preview img, .video-thumbnail, .blog-links img').all()) {
        await expect(frame).toHaveCSS('outline-style', 'solid');
        await expect(frame).toHaveCSS('outline-offset', '-1px');
        await expect(frame).toHaveCSS('border-radius', '8px');
        await expect(frame).toHaveCSS('box-shadow', 'none');
      }
      for (const logo of await clouds.locator('img').all()) {
        await expect(logo).toHaveCSS('outline-style', 'none');
      }
      if (width >= 1024) {
        const previews = await blog.locator('.blog-links > li:not(:first-child) a').evaluateAll((links) => links.map((link) => {
          const card = link.getBoundingClientRect();
          const image = link.querySelector('img')!.getBoundingClientRect();
          return { fraction: image.width / card.width, centerOffset: Math.abs(image.top + image.height / 2 - card.top - card.height / 2) };
        }));
        expect(previews.every((preview) => preview.fraction >= 0.35 && preview.centerOffset < 1)).toBe(true);
      }
    }
  }
});

test('Hub search surfaces stay consistent inside tinted control panels', async ({ page }) => {
  await page.goto('/hub/');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const hubSearchBackground = await page.locator('.dev-search').evaluate((element) => getComputedStyle(element).backgroundColor);

  await page.goto('/integrations/gallery/');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const inputBackground = await page.locator('main .search-field-input').evaluate((element) => getComputedStyle(element).backgroundColor);

  await page.goto('/hub/browse/');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(page.locator('.browse-search')).toBeVisible();
  const browseBackgrounds = await page.locator('.inpage-search-input, .browse-filter-group summary')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
  expect(browseBackgrounds.every((background) => background === inputBackground)).toBe(true);
  expect(await page.locator('.browse-controls').evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(inputBackground);

  await page.goto('/hub/glossary/');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(page.locator('.glossary-controls')).toBeVisible();
  await expect(page.locator('.glossary-controls .inpage-search-input')).toHaveCSS('background-color', inputBackground);
  const glossaryBackgrounds = await page.locator('.glossary-controls .api-filter-chip:not(.active)')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
  expect(glossaryBackgrounds.every((background) => background === hubSearchBackground)).toBe(true);
  expect(await page.locator('.glossary-filter-panel').evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(inputBackground);
});

test('AWS discovery opens a first-party overview with provider guidance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/hub/');
  const aws = page.locator('.cloud-links a').filter({ has: page.getByRole('heading', { name: 'AWS', exact: true }) });
  await expect(aws).toHaveAttribute('href', '/integrations/cloud/aws/overview/');
  await expect(aws).not.toHaveAttribute('target', '_blank');
  await aws.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AWS integrations overview');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://aspire.dev/integrations/cloud/aws/overview/');
  const body = page.locator('.sl-markdown-content');
  for (const title of ['Credentials and configuration', 'CloudFormation and AWS CDK', 'DynamoDB Local', 'Lambda and API Gateway', 'AppHost language support', 'Deployment preview']) {
    await expect(body.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(body.getByRole('link', { name: 'AWS integration documentation', exact: true }))
    .toHaveAttribute('href', 'https://docs.aws.amazon.com/sdk-for-net/v4/developer-guide/aspire-integrations.html');
  for (const href of await body.locator('a[href^="#"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')!))) {
    await expect(page.locator(href)).toHaveCount(1);
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/integrations/cloud/aws/overview/');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const logo = page.getByRole('img', { name: 'AWS logo', exact: true });
      await expect(logo).toBeVisible();
      await logo.scrollIntoViewIfNeeded();
      await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('Developer Hub and glossary share content alignment and complete breadcrumbs', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/hub/');
    const hub = await page.locator('[data-dev-center]').boundingBox();
    for (const [route, title] of [
      ['/hub/glossary/', 'Glossary'],
      ['/hub/glossary/apphost/', 'AppHost'],
      ['/hub/glossary/resourcenotificationservice/', 'ResourceNotificationService'],
    ]) {
      await page.goto(route);
      const content = await page.locator('[data-dev-center]').boundingBox();
      const heading = await page.locator('main h1').boundingBox();
      const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
      const bounds = await breadcrumb.boundingBox();
      await expect(breadcrumb.locator('.current')).toHaveText(title);
      if (width <= 480) {
        await expect(breadcrumb.locator('.bc-toggle-label')).toHaveText(title);
        await breadcrumb.locator('summary').click();
      }
      await expect(breadcrumb.getByRole('link', { name: 'Dev Hub', exact: true })).toHaveAttribute('href', '/hub/');
      if (width <= 480) await breadcrumb.locator('summary').click();
      expect(content!.x).toBeCloseTo(hub!.x, 0);
      expect(content!.width).toBeCloseTo(hub!.width, 0);
      expect(bounds!.x).toBeCloseTo(content!.x, 0);
      expect(heading!.x).toBeCloseTo(content!.x, 0);
      expect(heading!.y + heading!.height).toBeLessThan(bounds!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (title !== 'Glossary') {
        const article = await page.locator('.term-reading').boundingBox();
        expect(article!.x).toBeCloseTo(content!.x, 0);
        expect(article!.width).toBeCloseTo(content!.width, 0);
      }
    }
  }
});

test('Developer Hub remains browsable without JavaScript and reflows at narrow widths', async ({ browser, baseURL, page }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const staticPage = await context.newPage();
  await staticPage.goto('/hub/');
  await expect(staticPage.locator('.onboarding-options > li, .language-links > li, .cloud-links > li, .featured-samples > li, .reference-links > li, #dashboard, .video-links > li, .blog-links > li')).toHaveCount(30);
  await expect(staticPage.getByRole('button', { name: 'Search Aspire documentation' })).toBeDisabled();
  await context.close();
  for (const width of [320, 390, 640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/hub/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const input = await page.getByRole('button', { name: 'Search Aspire documentation' }).boundingBox();
    expect(input!.y + input!.height).toBeLessThan(900);
  }
});
