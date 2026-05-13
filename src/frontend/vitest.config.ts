import { getViteConfig } from 'astro/config';

export default getViteConfig({
  ssr: {
    noExternal: [
      '@astro-community/astro-embed-vimeo',
      '@astro-community/astro-embed-youtube',
      'lite-vimeo-embed',
      'lite-youtube-embed',
    ],
  },
  test: {
    // `threads` (worker_threads) has lower spawn overhead than the default
    // `forks` pool on Linux CI runners. Tests are `environment: 'node'` and
    // don't touch native addons, so this is safe.
    pool: 'threads',
    include: ['tests/unit/**/*.vitest.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
