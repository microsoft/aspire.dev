import { LOCALE_PATH_SEGMENT_PATTERN_SOURCE } from './locale-routes';

export const API_REFERENCE_PATH_PATTERN_SOURCE = '^/reference/api(?:[/.]|$)';
export const LOCALIZED_API_REFERENCE_PATH_PATTERN_SOURCE =
  `^/${LOCALE_PATH_SEGMENT_PATTERN_SOURCE}(?=/reference/api(?:[/.]|$))`;

const apiReferencePathPattern = new RegExp(API_REFERENCE_PATH_PATTERN_SOURCE, 'i');
const localizedApiReferencePathPattern = new RegExp(
  LOCALIZED_API_REFERENCE_PATH_PATTERN_SOURCE,
  'i'
);

function ensureLeadingSlash(pathname: string): string {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function isApiReferencePath(pathname: string): boolean {
  const normalizedPathname = ensureLeadingSlash(pathname);
  return (
    apiReferencePathPattern.test(normalizedPathname) ||
    localizedApiReferencePathPattern.test(normalizedPathname)
  );
}

export function stripApiReferenceLocale(pathname: string): string | undefined {
  const normalizedPathname = ensureLeadingSlash(pathname);
  const localeMatch = normalizedPathname.match(localizedApiReferencePathPattern);

  if (!localeMatch) {
    return undefined;
  }

  return normalizedPathname.slice(localeMatch[0].length) || '/';
}
