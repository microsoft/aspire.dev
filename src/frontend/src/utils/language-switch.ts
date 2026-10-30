import { isApiReferencePath, stripApiReferenceLocale } from './api-reference-routes';
import { isDefaultLocaleOnlyPath } from './default-locale-only-routes';
import {
  addLocaleToPath,
  DEFAULT_LOCALE,
  getLocaleFromPath,
  stripLocaleFromPath,
} from './locale-routes';

// Pages such as /hub/ and /reference/samples/<sample>/ are only generated in
// English, so the selector must not prefix a locale (e.g. /de/hub/ is a 404).
function isEnglishOnlyPath(pathname: string): boolean {
  return isApiReferencePath(pathname) || isDefaultLocaleOnlyPath(stripLocaleFromPath(pathname));
}

/** Locale the footer language selector shows for the current page. */
export function getSelectedLocaleForPath(pathname: string, preferredLocale?: string): string {
  return (
    getLocaleFromPath(pathname) ??
    (isEnglishOnlyPath(pathname) ? preferredLocale : undefined) ??
    DEFAULT_LOCALE
  );
}

/** Path to navigate to when the reader picks `locale` in the footer language selector. */
export function getLanguageSwitchPath(pathname: string, locale: string): string {
  const pathWithoutLocale = stripApiReferenceLocale(pathname) ?? stripLocaleFromPath(pathname);
  return isEnglishOnlyPath(pathname)
    ? pathWithoutLocale
    : addLocaleToPath(pathWithoutLocale, locale);
}
