import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Data validation must not initialize Astro integrations that rewrite tracked assets.
export default defineConfig({
  resolve: {
    alias: {
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
    },
  },
  test: {
    pool: 'threads',
    include: [
      'tests/unit/structured-data.vitest.test.ts',
      'tests/unit/update-integrations.vitest.test.ts',
    ],
    environment: 'node',
    testTimeout: 30000,
  },
});
