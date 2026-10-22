import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'hybrid-api-docs.spec.ts',
  workers: 1,
  use: { baseURL: process.env.HYBRID_TEST_URL || 'http://127.0.0.1:14324' },
});
