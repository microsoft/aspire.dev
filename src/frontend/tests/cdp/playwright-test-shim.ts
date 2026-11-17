// Prototype only (playwright.cdp.config.mjs): the specs import `@playwright/test`, which tsconfig.cdp.json maps to
// this file. It re-exports Playwright's test API unchanged, except that the worker's `browser` is a CDP connection
// to an already running browser (CDP_ENDPOINT) instead of a Chromium that Playwright launches. The same specs then
// run against Chromium, Lightpanda, Jint.Browser or Kitesurf without being edited.
import { chromium, test as base } from 'playwright/test';

export * from 'playwright/test';

// Without CDP_ENDPOINT, Playwright launches its own Chromium as usual (the no-recording baseline).
const endpoint = process.env.CDP_ENDPOINT;

export const test = !endpoint ? base : base.extend<{}, {}>({
  browser: [
    async ({}, use) => {
      const browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
      await use(browser);
      await browser.close().catch(() => {});
    },
    { scope: 'worker' },
  ],
});

export default test;
