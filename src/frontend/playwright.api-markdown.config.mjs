import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'api-markdown-routes.spec.ts',
  fullyParallel: true,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4322',
  },
  webServer: {
    command: 'pnpm git-env && pnpm check-data && astro dev --host 127.0.0.1 --port 4322',
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: '1',
      E2E_TESTS: '1',
    },
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000,
  },
});