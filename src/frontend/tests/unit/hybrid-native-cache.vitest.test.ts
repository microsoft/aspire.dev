import { describe, expect, it, vi } from 'vitest';
import type { APIContext, CacheProvider, MiddlewareNext } from 'astro';
import memoryProvider from 'astro/cache/memory';
import { HYBRID_CACHE_BYPASS_HEADER, withHybridApiCache } from '@utils/hybrid-api-cache';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

async function request(
  provider: CacheProvider, url: string, render: MiddlewareNext,
  headers: Record<string, string> = {},
) {
  const input = new Request(url, { headers });
  const receive = provider.onRequest;
  if (!receive) throw new Error('The native memory provider must implement onRequest.');
  return receive({ request: input, url: new URL(url), logger }, async () => {
    let maxAge: number | undefined;
    const cache: Pick<APIContext['cache'], 'enabled' | 'set'> = {
      enabled: true,
      set(options) {
        if (options === false) maxAge = undefined;
        else if ('maxAge' in options) maxAge = options.maxAge;
      },
    };
    const response = await withHybridApiCache({ request: input, cache }, render);
    // Astro applies native cache directives after middleware and before the provider stores the response.
    if (maxAge !== undefined) response.headers.set('CDN-Cache-Control', `max-age=${maxAge}`);
    return response;
  });
}

describe('native Astro response-cache ownership', () => {
  it('reuses the response inside the official provider without invoking page rendering', async () => {
    const provider = memoryProvider({ max: 128, query: { exclude: [] } });
    const render = vi.fn(() => Promise.resolve(new Response('API documentation')));
    const url = 'https://aspire.dev/reference/api/csharp/example/';
    const miss = await request(provider, url, render);
    expect(miss.headers.get('X-Astro-Cache')).toBe('MISS');
    expect(await miss.text()).toBe('API documentation');
    const hit = await request(provider, url, render);
    expect(hit.headers.get('X-Astro-Cache')).toBe('HIT');
    expect(await hit.text()).toBe('API documentation');
    expect(render).toHaveBeenCalledOnce();

    const hits = await Promise.all(Array.from({ length: 20 }, () => request(provider, url, render)));
    expect(hits.every((response) => response.headers.get('X-Astro-Cache') === 'HIT')).toBe(true);
    expect(render).toHaveBeenCalledOnce();
  });

  it('isolates credential bypass from an already-warmed public response', async () => {
    const provider = memoryProvider({ max: 128 });
    const url = 'https://aspire.dev/reference/api/csharp/example/';
    const publicPage = vi.fn(() => Promise.resolve(new Response('public')));
    const privatePage = vi.fn(() => Promise.resolve(new Response('uncached')));
    await request(provider, url, publicPage);
    for (let index = 0; index < 2; index++) {
      const response = await request(provider, url, privatePage, { [HYBRID_CACHE_BYPASS_HEADER]: '1' });
      expect(response.headers.has('X-Astro-Cache')).toBe(false);
      expect(await response.text()).toBe('uncached');
    }
    expect(privatePage).toHaveBeenCalledTimes(2);
    const publicHit = await request(provider, url, publicPage);
    expect(publicHit.headers.get('X-Astro-Cache')).toBe('HIT');
    expect(await publicHit.text()).toBe('public');
    expect(publicPage).toHaveBeenCalledOnce();
  });

  it.each<{ status: number; headers: Record<string, string> }>([
    { status: 404, headers: {} },
    { status: 503, headers: {} },
    { status: 200, headers: { 'Cache-Control': 'private, max-age=30' } },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
    { status: 200, headers: { 'Cache-Control': 'no-cache' } },
    { status: 200, headers: { 'Set-Cookie': 'preference=value' } },
  ])('does not retain unsuccessful/private/cookie-setting output: %j', async ({ status, headers }) => {
    const provider = memoryProvider({ max: 128 });
    const render = vi.fn(() => Promise.resolve(new Response('not cached', { status, headers })));
    const url = 'https://aspire.dev/reference/api/typescript/example/';
    await request(provider, url, render);
    const response = await request(provider, url, render);
    expect(response.headers.has('X-Astro-Cache')).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('keeps HTML and Markdown separate and preserves all output-affecting query parameters', async () => {
    const provider = memoryProvider({ max: 128, query: { exclude: [] } });
    const render = vi.fn(() => Promise.resolve(new Response('variant')));
    const html = 'https://aspire.dev/reference/api/csharp/example/';
    const markdown = 'https://aspire.dev/reference/api/csharp/example.md';
    await request(provider, html, render);
    expect((await request(provider, markdown, render)).headers.get('X-Astro-Cache')).toBe('MISS');
    expect((await request(provider, html, render)).headers.get('X-Astro-Cache')).toBe('HIT');
    expect((await request(provider, markdown, render)).headers.get('X-Astro-Cache')).toBe('HIT');
    expect((await request(provider, html + '?q=one', render)).headers.get('X-Astro-Cache')).toBe('MISS');
    expect((await request(provider, html + '?q=two', render)).headers.get('X-Astro-Cache')).toBe('MISS');
    expect((await request(provider, html + '?q=one', render)).headers.get('X-Astro-Cache')).toBe('HIT');
  });

  it('evicts LRU entries and supports native path invalidation', async () => {
    const provider = memoryProvider({ max: 2 });
    const render = vi.fn(() => Promise.resolve(new Response('API')));
    const url = (slug: string) => `https://aspire.dev/reference/api/csharp/${slug}/`;
    await request(provider, url('one'), render);
    await request(provider, url('two'), render);
    await request(provider, url('three'), render);
    expect((await request(provider, url('one'), render)).headers.get('X-Astro-Cache')).toBe('MISS');
    await provider.invalidate({ path: '/reference/api/csharp/one/' });
    expect((await request(provider, url('one'), render)).headers.get('X-Astro-Cache')).toBe('MISS');
  });

  it('does not retain incomplete streamed output', async () => {
    const provider = memoryProvider({ max: 128 });
    const render = vi.fn(() => Promise.resolve(new Response(new ReadableStream({
      start(controller) { controller.error(new Error('Interrupted render')); },
    }))));
    const url = 'https://aspire.dev/reference/api/csharp/broken/';
    await expect(request(provider, url, render)).rejects.toThrow('Interrupted render');
    await expect(request(provider, url, render)).rejects.toThrow('Interrupted render');
    expect(render).toHaveBeenCalledTimes(2);
  });
});
