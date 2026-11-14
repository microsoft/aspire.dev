// Playwright configuration for the Douze build: the same specs (tests/e2e), served by StaticHost from its wwwroot,
// which `douze -s src/site -o src/statichost/StaticHost/wwwroot` fills (what production serves: Markdown negotiation,
// canonical redirects, 404, headers). Run: `pnpm exec playwright test --config playwright.douze.config.mjs`.
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

const e2ePort = Number(process.env.PLAYWRIGHT_TEST_PORT || '4322');

// Playwright 1.61 wants its own Chromium build; when it is not installed, PLAYWRIGHT_CHROMIUM points at another
// Chrome for Testing build (for example ~/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM;

export default defineConfig({
  ...base,
  projects: base.projects.map((project) => ({
    ...project,
    use: { ...project.use, ...(executablePath ? { launchOptions: { executablePath } } : {}) },
  })),
  webServer: {
    // STATICHOST_NO_BUILD: StaticHost is already built (the CI builds it while Playwright installs Chromium), so the
    // tests start its assembly directly: `dotnet run --no-build` still evaluates the project, which takes seconds.
    ...(process.env.STATICHOST_NO_BUILD
      ? { command: `dotnet bin/Release/net10.0/StaticHost.dll --urls http://127.0.0.1:${e2ePort}`, cwd: fileURLToPath(new URL('../statichost/StaticHost/', import.meta.url)) }
      : { command: `dotnet run -c Release --project ../statichost/StaticHost --urls http://127.0.0.1:${e2ePort}` }),
    // No Redis runs with the tests: the short connect timeout keeps StaticHost from waiting 5 s per attempt at startup.
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', DOTNET_NOLOGO: '1', ConnectionStrings__cache: 'localhost:6379,abortConnect=false,connectTimeout=500' },
    url: `http://127.0.0.1:${e2ePort}/`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
