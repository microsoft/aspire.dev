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
    include: ['tests/unit/**/*.vitest.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
