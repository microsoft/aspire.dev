import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const e2ePort = Number(process.env.PLAYWRIGHT_TEST_PORT || '4322');
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  // Default (30s) is tight once twoslash code blocks add server-side work
  // during dev mode. 60s gives `page.goto` enough headroom without masking
  // real regressions.
  timeout: 60_000,
  // CI shards each viewport project across separate runners and stitches
  // the per-shard `blob-report/` outputs into a single HTML report in a
  // dedicated `report` job. We keep `github` (workflow annotations) and
  // `junit` (XML for external tooling) on every shard so we don't lose
  // them by sharding. The `html` reporter is intentionally omitted from
  // CI: per-shard HTML reports would have to be discarded anyway, since
  // `playwright merge-reports` regenerates a unified HTML report from
  // the blob outputs.
  reporter: isCI
    ? [
        ['blob'],
        ['github'],
        ['list'],
        ['junit', { outputFile: 'test-results/junit/results.xml' }],
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: e2eBaseUrl,
    screenshot: 'only-on-failure',
    // Recording every run doubles the test time; with CI retries the first retry of a failing test records both.
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'tablet-chromium',
      use: {
        browserName: 'chromium',
        ...devices['iPad Pro 11'],
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        ...devices['Pixel 7'],
      },
    },
  ],
  webServer: isCI
    ? {
        // CI serves the built site with StaticHost, as production does (Markdown negotiation, canonical
        // redirects, the 404 page, headers) from its wwwroot, where the E2E jobs unpack dist. The Frontend
        // Build job builds it, so the tests start its assembly directly: `dotnet run --no-build` still
        // evaluates the project, which takes seconds. The E2E jobs start it before dist arrives
        // (.github/scripts/start-web-server.mjs), hence reuseExistingServer.
        command: `dotnet bin/Release/net11.0/StaticHost.dll --urls ${e2eBaseUrl}`,
        cwd: fileURLToPath(new URL('../statichost/StaticHost/', import.meta.url)),
        // No Redis runs with the tests: the short connect timeout keeps StaticHost from waiting 5 s per
        // attempt at startup.
        env: {
          ...process.env,
          ASPNETCORE_ENVIRONMENT: 'Development',
          DOTNET_NOLOGO: '1',
          ConnectionStrings__cache: 'localhost:6379,abortConnect=false,connectTimeout=500',
        },
        url: `${e2eBaseUrl}/`,
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 180_000,
      }
    : {
        // Locally `astro dev` keeps interactive work free of a full rebuild.
        command: `bun run git-env && bun run check-data && astro dev --host 127.0.0.1 --port ${e2ePort}`,
        env: {
          ...process.env,
          ASTRO_TELEMETRY_DISABLED: '1',
        },
        url: e2eBaseUrl,
        reuseExistingServer: false,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120000,
      },
});
