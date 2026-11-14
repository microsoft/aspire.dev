// Prototype (E2E driver and browser alternatives): the Douze configuration, with every worker connected over CDP to a
// browser that is already running at CDP_ENDPOINT instead of a Chromium that Playwright launches. tsconfig.cdp.json
// points the specs' `@playwright/test` import at tests/cdp/playwright-test-shim.ts, which swaps the `browser` fixture.
// Run: CDP_ENDPOINT=http://127.0.0.1:9222 bun run playwright test --config playwright.cdp.config.mjs --project=desktop-chromium <specs>
import { defineConfig } from '@playwright/test';
import douze from './playwright.douze.config.mjs';

export default defineConfig({
  ...douze,
  tsconfig: './tsconfig.cdp.json',
  // A CDP browser that is not Chromium may not record traces or videos; keep failure screenshots only.
  use: { ...douze.use, trace: 'off', video: 'off' },
  projects: douze.projects.map(({ use: { launchOptions, channel, ...use }, ...project }) => ({ ...project, use })),
});
