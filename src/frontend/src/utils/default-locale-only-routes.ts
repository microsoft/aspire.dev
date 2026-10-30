import { API_REFERENCE_PATH_PATTERN_SOURCE } from './api-reference-routes';

/**
 * Routes rendered by custom `src/pages` files through `<StarlightPage>` that
 * exist only in the default (English) locale. Starlight still emits
 * `hreflang` alternates for every configured locale on these pages, but the
 * localized URLs (for example `/de/hub/`) are never generated and return 404.
 */
const defaultLocaleOnlyPathPatterns = [
  /^\/hub(?:\/|$)/i,
  new RegExp(API_REFERENCE_PATH_PATTERN_SOURCE, 'i'),
  /^\/reference\/samples\/[^/]+\/?$/i,
];

export function isDefaultLocaleOnlyPath(pathname: string): boolean {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return defaultLocaleOnlyPathPatterns.some((pattern) => pattern.test(normalizedPathname));
}
