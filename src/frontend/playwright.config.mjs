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
  reporter: isCI
    ? [
        ['github'],
        ['list'],
        ['junit', { outputFile: 'test-results/junit/results.xml' }],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: e2eBaseUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
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
  webServer: {
    command: `pnpm git-env && pnpm check-data && astro dev --host 127.0.0.1 --port ${e2ePort}`,
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: '1',
      E2E_TESTS: '1',
    },
    url: e2eBaseUrl,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000,
  },
});
