import { getLocaleFromPath } from './locale-routes';

const translatedPaths: ReadonlySet<string> = new Set(__ASPIRE_TRANSLATED_PATHS__);

function normalizeRoutePath(pathname: string): string {
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const withoutQuery = withLeadingSlash.replace(/[?#].*$/, '');
  return (withoutQuery.endsWith('/') ? withoutQuery : `${withoutQuery}/`).toLowerCase();
}

/**
 * Whether `pathname` is a localized route backed by a real translation. Paths
 * without a locale prefix (the default locale) always return `true`.
 *
 * Untranslated locale routes are not built: the static host serves the
 * default-locale page in place, so search engines should not be pointed at
 * them as distinct alternates.
 */
export function isTranslatedPath(
  pathname: string,
  paths: ReadonlySet<string> = translatedPaths
): boolean {
  if (!getLocaleFromPath(pathname)) return true;
  return paths.has(normalizeRoutePath(pathname));
}
