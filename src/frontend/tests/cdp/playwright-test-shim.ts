// Prototype only (playwright.cdp.config.mjs): the specs import `@playwright/test`, which tsconfig.cdp.json maps to
// this file. It re-exports Playwright's test API unchanged, except that the worker's `browser` is a CDP connection
// to an already running browser (CDP_ENDPOINT) instead of a Chromium that Playwright launches. The same specs then
// run against Chromium, Lightpanda, Jint.Browser or Kitesurf without being edited.
//
// Opt-in workarounds for gaps in a CDP engine, enabled per engine by tests/cdp/run-engine.sh (CDP_WORKAROUNDS, a
// comma-separated list). They change how a test reaches the page, never what it asserts:
// - scope-polyfill: rewrites every served stylesheet so that `@scope (X) to (Y) { R }` becomes R with `:where(X)`
//   in front (the lower bound Y is dropped). Douze compiles component styles to @scope, which only Chromium
//   implements here; without it, half of the site's rules are dropped. Measures what an engine fix would buy.
// - set-content-route: page.setContent serves the HTML from a same-origin route and navigates to it, for engines
//   where document.open()/write() after load is a no-op or console events don't reach Playwright (Jint.Browser).
// - style-tag-no-load: page.addStyleTag({ content }) appends the <style> without waiting for its load event,
//   which some engines never fire for inline styles (Jint.Browser).
// - extra-connection: browser.newContext opens a second CDP connection when the engine allows a single browser
//   context per connection (Lightpanda), as `all resource destinations remain available without JavaScript` needs.
import { chromium, test as base, type Browser, type BrowserContext, type Page } from 'playwright/test';
import { unscopeCss } from './unscope-css';

export * from 'playwright/test';

// Without CDP_ENDPOINT, Playwright launches its own Chromium as usual (the no-recording baseline).
const endpoint = process.env.CDP_ENDPOINT;
const workarounds = new Set((process.env.CDP_WORKAROUNDS ?? '').split(',').map((name) => name.trim()).filter(Boolean));

const connect = () => chromium.connectOverCDP(endpoint!, { timeout: 30_000 });

function allowExtraContexts(browser: Browser, extra: Browser[]) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    try {
      return await newContext(options);
    } catch (error) {
      if (!/more than one browser context/i.test(String(error))) throw error;
      const second = await connect();
      extra.push(second);
      return second.newContext(options);
    }
  };
}

async function polyfillScope(context: BrowserContext) {
  // Node's fetch, not route.fetch(): Playwright's request context first reads the browser's cookies over CDP, which
  // Lightpanda never answers (route.fetch times out). The site's stylesheets don't depend on cookies.
  await context.route(/\.css(?:\?|$)/, async (route) => {
    const response = await fetch(route.request().url());
    const body = await response.text();
    await route.fulfill({
      status: response.status,
      contentType: response.headers.get('content-type') ?? 'text/css',
      body: response.ok ? unscopeCss(body) : body,
    });
  });
}

function patchPage(page: Page, baseURL: string | undefined) {
  if (workarounds.has('set-content-route')) {
    let count = 0;
    page.setContent = async (html, options = {}) => {
      const url = new URL(`/__cdp-set-content/${process.pid}-${++count}`, baseURL ?? page.url()).href;
      await page.route(url, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }), { times: 1 });
      await page.goto(url, { waitUntil: options.waitUntil ?? 'load', timeout: options.timeout });
    };
  }
  if (workarounds.has('style-tag-no-load')) {
    const addStyleTag = page.addStyleTag.bind(page);
    page.addStyleTag = async (options = {}) => {
      if (options.content === undefined) return addStyleTag(options);
      return (await page.evaluateHandle((content) => {
        const style = document.createElement('style');
        style.textContent = content;
        (document.head ?? document.documentElement).append(style);
        return style;
      }, options.content)).asElement()!;
    };
  }
}

export const test = !endpoint ? base : base.extend<{}, {}>({
  browser: [
    async ({}, use) => {
      const browser = await connect();
      const extra: Browser[] = [];
      if (workarounds.has('extra-connection')) allowExtraContexts(browser, extra);
      await use(browser);
      for (const other of extra) await other.close().catch(() => {});
      await browser.close().catch(() => {});
    },
    { scope: 'worker' },
  ],
  context: async ({ context }, use) => {
    if (workarounds.has('scope-polyfill')) await polyfillScope(context);
    await use(context);
  },
  page: async ({ page, baseURL }, use) => {
    patchPage(page, baseURL);
    await use(page);
  },
});

export default test;
