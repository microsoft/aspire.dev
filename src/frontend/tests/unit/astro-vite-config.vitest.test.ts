import { afterEach, expect, test, vi } from 'vitest';
import { redirects } from '../../config/redirects.mjs';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test.each([undefined, 'http://127.0.0.1:54321'])(
  'retains catalog redirect definitions with StaticHost origin %s',
  async (origin) => {
    vi.stubEnv('ASPIRE_STATICHOST_URL', origin);
    vi.resetModules();
    const { default: config } = await import('../../astro.config.mjs');

    expect(config.vite.define.__ASPIRE_REDIRECT_PATHS__).toBe(
      JSON.stringify(Object.keys(redirects))
    );
    expect(config.vite.server?.proxy).toEqual(
      origin
        ? {
            '^/api/live(?:/.*)?$': {
              target: origin,
              changeOrigin: true,
              secure: false,
            },
          }
        : undefined
    );
  }
);
