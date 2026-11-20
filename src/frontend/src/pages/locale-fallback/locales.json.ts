import type { APIRoute } from 'astro';
import { fallbackLocales, type LocaleFallbackManifest } from '@utils/locale-fallback';

export const prerender = true;

/**
 * Locales whose untranslated routes the static host serves in place with the
 * English page (see `src/statichost/StaticHost/Routing/LocaleFallbackMiddleware.cs`).
 */
export const GET: APIRoute = () => {
  const manifest: LocaleFallbackManifest = { locales: [...fallbackLocales] };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
