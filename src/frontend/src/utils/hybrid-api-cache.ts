import type { APIContext, MiddlewareNext } from 'astro';

export const HYBRID_CACHE_BYPASS_HEADER = 'X-Aspire-Cache-Bypass';

export async function withHybridApiCache(
  context: { cache: Pick<APIContext['cache'], 'enabled' | 'set'>; request: Request },
  next: MiddlewareNext,
): Promise<Response> {
  if (!context.cache.enabled) return next();

  context.cache.set({ maxAge: 1800 });
  if (context.request.headers.get(HYBRID_CACHE_BYPASS_HEADER) === '1') {
    context.cache.set(false);
  }
  const response = await next();
  // Native cache hits skip middleware, so the worker supplies this variant before lookup.
  response.headers.append('Vary', HYBRID_CACHE_BYPASS_HEADER);
  const directives = (response.headers.get('Cache-Control') ?? '')
    .split(',').map((value) => value.trim().split('=')[0].toLowerCase());
  if (response.status !== 200 ||
      directives.some((value) => ['private', 'no-store', 'no-cache'].includes(value))) {
    context.cache.set(false);
  }
  return response;
}
