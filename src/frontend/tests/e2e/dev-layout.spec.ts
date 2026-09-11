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
  for (const route of ['/dev/', '/dev/browse/', '/dev/glossary/', '/dev/glossary/apphost/']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(await response!.text()).not.toContain('/@vite/client');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (route === '/dev/browse/') await expect(page.locator('resource-browser')).toHaveAttribute('data-ready', '');
    if (route === '/dev/glossary/') await expect(page.getByRole('searchbox', { name: 'Find a term' })).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  await page.goto('/dev/');
  await page.getByRole('button', { name: 'Search Aspire documentation' }).click();
  const dialog = page.locator('site-search dialog');
  await dialog.locator('input.pagefind-ui__search-input').fill('AppHost');
  await expect(dialog.locator('.pagefind-ui__result-link').first()).toBeVisible();
  expect(assetTypes.has('script')).toBe(true);
  expect(assetTypes.has('stylesheet')).toBe(true);
  expect(errors).toEqual([]);
});

test('custom destinations excluded from the Markdown validator exist with their bookmark targets', async ({ page, request }) => {
  for (const [route, title] of [
    ['/dev/', 'Dev Hub'],
    ['/dev/glossary/ats/', 'Aspire Type System'],
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
  }
  const legacy = await request.get('/get-started/glossary/');
  expect(legacy.status()).toBe(200);
  const html = await legacy.text();
  expect(html).toContain('id="polyglot"');
  expect(html).toContain('href="/dev/glossary/polyglot/"');
  await page.goto('/get-started/glossary/#polyglot');
  await expect(page).toHaveURL(/\/dev\/glossary\/#polyglot$/);
  await expect(page.locator('#polyglot')).toHaveCount(1);
});

test('Quickstart uses a static CSS edge texture in both themes and screen sizes', async ({ page }) => {
  await page.goto('/dev/');
  const card = page.locator('.resource-primary .resource-card');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      for (const reducedMotion of ['reduce', 'no-preference'] as const) {
        await page.emulateMedia({ reducedMotion });
        const texture = await card.evaluate((element) => {
          const style = getComputedStyle(element, '::before');
          return {
            background: style.backgroundImage, mask: style.maskImage, opacity: style.opacity,
            animation: style.animationName, pointerEvents: style.pointerEvents,
          };
        });
        expect(texture.background).toContain('repeating-conic-gradient');
        expect(texture.mask).toMatch(/^linear-gradient\((?:to left|270deg),/);
        expect(texture.background + texture.mask).not.toContain('url(');
        expect(texture.opacity).toBe('0.12');
        expect(texture.animation).toBe('none');
        expect(texture.pointerEvents).toBe('none');
        await expect(card).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(card).toHaveCSS('forced-color-adjust', 'auto');
  expect(await card.evaluate((element) => getComputedStyle(element, '::before').display)).toBe('none');
});

test('Dev Hub introduction and Markdown use the current Aspire positioning', async ({ page, request }) => {
  const description = 'Aspire is the tool for code-first, extensible, observable dev and deploy.';
  await page.goto('/dev/');
  await expect(page.locator('section[aria-labelledby="getting-started-heading"]')).toContainText(description);
  const markdown = await request.get('/dev.md');
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain(description);
  await expect(page.locator('a[href="https://github.com/dotnet/aspire"]')).toHaveCount(0);
  await page.goto('/community/contributors/');
  await expect(page.getByRole('link', { name: 'microsoft/aspire', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'microsoft/aspire', exact: true })).toHaveAttribute('href', 'https://github.com/microsoft/aspire');
  await expect(page.getByRole('link', { name: 'dotnet/aspire', exact: true })).toHaveCount(0);
});

test('Dev Hub links share animated underlines and topic cards use the concept-card hover treatment', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/dev/');
  await expect(page.locator('.dev-home a:not(.dashboard-links a):not([data-underline-trigger])')).toHaveCount(0);
  for (const link of await page.locator('.dev-home a:not(.dashboard-links a)').all()) {
    await expect(link.locator('[data-link-underline]')).toHaveCount(1);
  }
  for (const selector of ['.dev-browse-link', '.resource-primary a', '.resource-links li:not(.resource-primary) a', '.topic-links a', '.language-links a', '.cloud-links a', '.featured-samples a', '.reference-links a', '.dashboard-previews a', '.channel-link', '.video-links a', '.blog-links a']) {
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
  await page.goto('/dev/');
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
  for (const route of ['/dev/', '/dev/browse/', '/dev/glossary/']) {
    await page.goto(route);
    const panels = page.locator('main > .content-panel');
    const header = panels.nth(0);
    const content = panels.nth(1);
    await expect(panels).toHaveCount(2);
    await expect(header.locator('h1')).toHaveCount(1);
    await expect(header.locator('.breadcrumb, .dev-description, .actions-container')).toHaveCount(0);
    await expect(page.locator('main .hero')).toHaveCount(0);
    await expect(content).toHaveCSS('border-top-width', '1px');
    if (route === '/dev/browse/') {
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
        const body = content.locator(route === '/dev/' ? '.dev-discovery' : route === '/dev/browse/' ? 'resource-browser' : 'glossary-browser');
        expect((await body.boundingBox())!.y).toBeGreaterThanOrEqual(breadcrumb.y + breadcrumb.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  }
});

test('Pagefind includes every glossary entry but excludes Dev Hub directory pages', async ({ page, request }) => {
  for (const route of ['/dev/', '/dev/browse/', '/dev/glossary/']) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toMatch(/<main\b[^>]*\bdata-pagefind-body\b/);
  }
  await page.goto('/dev/glossary/');
  const termLinks = page.locator('[data-term-link]');
  await expect(termLinks.first()).toBeAttached();
  const termPaths = await termLinks.evaluateAll((links) =>
    [...new Set(links.map((link) => new URL(link.getAttribute('href')!, window.location.origin).pathname))]
      .filter((path) => /^\/dev\/glossary\/[^/]+\/$/.test(path)));
  expect(termPaths.length).toBeGreaterThan(0);
  for (const path of termPaths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).toMatch(/<main\b[^>]*\bdata-pagefind-body\b/);
  }
});

test('Developer Hub links directly to existing resources and the latest featured videos', async ({ page }) => {
  await page.goto('/dev/');
  const links = page.getByRole('region', { name: 'New to Aspire?' }).getByRole('link');
  const destinations = [
    '/get-started/first-app/', '/get-started/deploy-first-app/',
    '/get-started/add-aspire-existing-app/', '/dev/glossary/',
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

test('newcomer paths precede three-column topic cards with responsive layouts', async ({ page }) => {
  await page.goto('/dev/');
  const newcomers = page.getByRole('region', { name: 'New to Aspire?' });
  const topics = page.getByRole('navigation', { name: 'Browse by topic' });
  await expect(newcomers.locator('.section-description')).toContainText('Start with the Quickstart');
  await expect(newcomers.getByRole('heading', { level: 3 })).toHaveText(['Quickstart', 'Tutorial', 'How-to', 'Glossary']);
  const descriptions = await newcomers.locator('.resource-copy p').allTextContents();
  await expect(topics.getByRole('link')).toHaveCount(6);
  const markdown = await (await page.request.get('/dev.md')).text();
  expect(markdown.indexOf('## New to Aspire?')).toBeLessThan(markdown.indexOf('## Browse by topic'));
  expect(markdown).toContain(await newcomers.locator('.section-description').innerText());
  for (const description of descriptions) expect(markdown).toContain(description);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const search = (await page.getByRole('button', { name: 'Search Aspire documentation' }).boundingBox())!;
    const start = (await newcomers.boundingBox())!;
    const browse = (await topics.boundingBox())!;
    expect(search.y + search.height).toBeLessThan(start.y);
    expect(start.y + start.height).toBeLessThan(browse.y);
    const columns = await topics.locator('ul').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width >= 1024 ? 3 : width >= 640 ? 2 : 1);
    const starterColumns = await newcomers.locator('ul').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(starterColumns).toBe(width >= 768 ? 2 : 1);
    const primary = (await newcomers.getByRole('link').first().boundingBox())!;
    const tutorial = (await newcomers.getByRole('link').nth(1).boundingBox())!;
    const glossary = (await newcomers.getByRole('link').last().boundingBox())!;
    if (width >= 768) {
      expect(primary.x + primary.width).toBeLessThan(tutorial.x);
      expect(primary.y).toBeCloseTo(tutorial.y, 0);
      expect(primary.y + primary.height).toBeCloseTo(glossary.y + glossary.height, 0);
    } else {
      expect(primary.y + primary.height).toBeLessThanOrEqual(tutorial.y);
    }
    await expect(newcomers.getByRole('link').first()).toHaveCSS('border-width', '1px');
    for (const link of (await newcomers.getByRole('link').all()).slice(1)) {
      await expect(link).toHaveCSS('border-width', '0px');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const starter = newcomers.getByRole('link').first();
  await expect(starter.locator('.resource-action')).toHaveText('Start building');
  await starter.focus();
  await expect(starter).toBeFocused();
  await expect(starter).not.toHaveCSS('outline-style', 'none');
  await expect(starter).toHaveCSS('outline-offset', '-4px');
  await starter.hover();
  for (const element of [starter, starter.locator('h3'), starter.locator('p'), starter.locator('.resource-action')]) {
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
  await page.goto('/dev/');
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
    for (const body of await page.locator('.topic-links p, .resource-links > li:not(.resource-primary) p, .language-links p, .sample-copy p, .cloud-links p, .reference-links p, .blog-copy p, .dashboard-previews figcaption p, .topic-action, .resource-action').all()) {
      await expect(body).toHaveCSS('font-size', '16px');
    }
    const quickstartSize = await page.locator('.resource-primary p').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(quickstartSize).toBeGreaterThanOrEqual(22);
    expect(quickstartSize).toBeLessThanOrEqual(26);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('sample previews reserve their loaded proportions before images arrive', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/_image/**', (route) => route.abort());
    await page.goto('/dev/');
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
  await page.goto('/dev/');
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
  await page.goto('/dev/');
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
    const start = (await banner.getByRole('link', { name: 'Try Aspire', exact: true }).boundingBox())!;
    expect(docs.x - dev.x - dev.width).toBeCloseTo(8, 0);
    expect(start.x - docs.x - docs.width).toBeCloseTo(8, 0);
  }
  await page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Dev Hub');
});

test('Dev Hub has a distinct active header button on hub and browse routes in both themes', async ({ page }) => {
  for (const route of ['/dev/', '/dev/browse/', '/']) {
    await page.goto(route);
    const hub = page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true });
    for (const theme of ['light', 'dark']) {
      await page.mouse.move(0, 0);
      await hub.evaluate((element) => element.blur());
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      await expect(hub).toBeVisible();
      if (route === '/') {
        await expect(hub).not.toHaveAttribute('aria-current');
        await expect(hub).toHaveCSS('border-width', '0px');
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
        if (theme === 'light') {
          expect(colors.background).toBe('rgb(213, 210, 246)');
          expect(colors.foreground).toBe('rgb(81, 43, 212)');
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
          await expect(control).toHaveCSS('color', 'rgb(81, 43, 212)');
          await control.focus();
          await expect(control).toHaveCSS('outline-style', 'solid');
          await control.evaluate((element) => element.blur());
        }
      }
    }
  }
});

test('Developer Hub dashboard screenshots load and its links reach real sections', async ({ page }) => {
  await page.goto('/dev/#dashboard');
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
  await page.goto('/dev/');
  for (const width of [320, 390, 640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const layout = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.resource-links > li:not(.resource-primary) .resource-card')];
        const panels = [...document.querySelectorAll('.dashboard-previews figure')];
        const videos = [...document.querySelectorAll('.video-links a')];
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          arrowInsets: cards.map((card) => card.getBoundingClientRect().right - card.querySelector('h3 svg')!.getBoundingClientRect().right),
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
      await page.goto('/dev/glossary/');
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
      expect(layout.hasTagline).toBe(true);
      expect(layout.pillHeights.every((height) => height >= (width <= 600 ? 44 : 36))).toBe(true);
      expect(layout.searchClass).toContain('inpage-search-input');
      await expect(page.locator('glossary-browser select')).toHaveCount(0);
      await expect(page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true })).toBeVisible();
    }
  }
});

test('Developer Hub and glossary emit canonical metadata without filter parameters', async ({ page }) => {
  for (const [route, canonical] of [
    ['/dev/', '/dev/'],
    ['/dev/glossary/?topic=foundations', '/dev/glossary/'],
    ['/dev/glossary/apphost/?from=%2Fdev%2Fglossary%2F', '/dev/glossary/apphost/'],
    ['/get-started/glossary/#apphost', '/dev/glossary/'],
  ]) {
    await page.goto(route);
    const canonicalLink = page.locator('link[rel="canonical"]');
    await expect(canonicalLink).toHaveCount(1);
    await expect(canonicalLink).toHaveAttribute('href', `https://aspire.dev${canonical}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  }
});

test('localized navigation keeps the English Developer Hub destination', async ({ page }) => {
  await page.goto('/de/docs/');
  const link = page.getByRole('banner').getByRole('link', { name: 'Dev Hub', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/dev/');
});

test('the hub and glossary retain accessible light and dark layouts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/dev/', '/dev/glossary/', '/dev/glossary/?topic=foundations&topic=reference', '/dev/glossary/apphost/']) {
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
    ['/dev/', 'Dev Hub'],
    ['/dev/glossary/', 'Aspire glossary'],
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
    ['/dev/glossary/apphost/', '# AppHost'],
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
    for (const route of ['/dev/glossary/apphost/']) {
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
  await page.goto('/dev/');
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
  await expect(page).toHaveURL(/\/dev\/$/);
  await page.goto('/dev/glossary/');
  await expect(page.getByRole('banner').locator('button[data-open-modal]')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Find a term' })).toBeVisible();
});

test('discovery cards have working destinations, images, icons, colors, and matching Markdown', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dev/');
  await expect(page.locator('.hero > img')).toHaveCount(0);
  const topicDestinations = await page.getByRole('navigation', { name: 'Browse by topic' }).locator('a')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('href')));
  expect(topicDestinations).toEqual([
    '/docs/', '/integrations/', '/dashboard/', '/deployment/', '/reference/overview/', '/community/',
  ]);
  const markdown = await (await page.request.get('/dev.md')).text();
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
  const icons = await page.locator('.language-links svg').evaluateAll((elements) => elements.map((element) => element.innerHTML.trim()));
  expect(icons.every(Boolean)).toBe(true);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    const starterColors = await page.locator('.resource-icon').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
    expect(new Set(starterColors).size).toBe(4);
    const colors = await page.locator('.topic-links a').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
    expect(new Set(colors).size).toBe(6);
  }
});

test('cloud and blog discovery stays readable and responsive', async ({ page }) => {
  await page.goto('/dev/');
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
  const markdown = await (await page.request.get('/dev.md')).text();
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

test('AWS discovery opens a first-party overview with provider guidance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/');
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
    await page.goto('/dev/');
    const hub = await page.locator('[data-dev-center]').boundingBox();
    for (const [route, title] of [
      ['/dev/glossary/', 'Glossary'],
      ['/dev/glossary/apphost/', 'AppHost'],
      ['/dev/glossary/resourcenotificationservice/', 'ResourceNotificationService'],
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
      await expect(breadcrumb.getByRole('link', { name: 'Dev Hub', exact: true })).toHaveAttribute('href', '/dev/');
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
  await staticPage.goto('/dev/');
  await expect(staticPage.locator('.resource-links > li, .language-links > li, .cloud-links > li, .featured-samples > li, .reference-links > li, #dashboard, .video-links > li, .blog-links > li')).toHaveCount(30);
  await expect(staticPage.getByRole('button', { name: 'Search Aspire documentation' })).toBeDisabled();
  await context.close();
  for (const width of [320, 390, 640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dev/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const input = await page.getByRole('button', { name: 'Search Aspire documentation' }).boundingBox();
    expect(input!.y + input!.height).toBeLessThan(900);
  }
});
