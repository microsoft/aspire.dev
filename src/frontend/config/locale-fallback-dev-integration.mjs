// @ts-check
import { locales } from './locales.ts';
import { getTranslatedPaths } from './translated-paths.mjs';

const localeSegments = Object.keys(locales)
  .filter((key) => key !== 'root')
  .map((key) => key.toLowerCase());

/**
 * Path the dev server should render for `pathname`, mirroring StaticHost's
 * `LocaleFallbackMiddleware`: untranslated locale routes (which the build no
 * longer emits) render the English page in place. Returns `undefined` when the
 * request needs no rewrite.
 *
 * @param {string} pathname
 * @param {ReadonlySet<string>} translatedPaths
 * @returns {string | undefined}
 */
export function getLocaleFallbackDevPath(pathname, translatedPaths) {
  const match = pathname.match(/^\/([^/]+)(\/.*)$/);
  if (!match) return undefined;

  const [, segment, unlocalizedPath] = match;
  if (!localeSegments.includes(segment.toLowerCase()) || unlocalizedPath === '/') {
    return undefined;
  }
  // `/de/ja/x/` must not serve the Japanese page as an English fallback for `de`.
  if (localeSegments.includes(unlocalizedPath.split('/')[1]?.toLowerCase())) return undefined;

  const lastSegment = unlocalizedPath.slice(unlocalizedPath.lastIndexOf('/') + 1);
  const isMarkdown = lastSegment.endsWith('.md');
  // Only pages and their Markdown copies fall back; directory routes without a
  // trailing slash are left for the dev server to redirect.
  if (!unlocalizedPath.endsWith('/') && !isMarkdown) return undefined;
  const pagePath = isMarkdown ? `${pathname.slice(0, -'.md'.length)}/` : pathname;
  if (translatedPaths.has(pagePath.toLowerCase())) return undefined;

  return unlocalizedPath;
}

/**
 * Serves the English page in place of untranslated locale routes during
 * `astro dev`, so local development and E2E runs match production.
 *
 * @returns {import('astro').AstroIntegration}
 */
export function localeFallbackDevIntegration() {
  return {
    name: 'aspire-locale-fallback-dev',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          // Re-read on each locale request so new translations are picked up without a restart.
          const rewrittenPath = localeSegments.some((locale) =>
            url.pathname.toLowerCase().startsWith(`/${locale}/`)
          )
            ? getLocaleFallbackDevPath(url.pathname, new Set(getTranslatedPaths()))
            : undefined;
          if (rewrittenPath) {
            req.url = `${rewrittenPath}${url.search}`;
            res.setHeader('Content-Language', 'en');
          }
          next();
        });
      },
    },
  };
}
