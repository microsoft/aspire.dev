import { locales } from '../../config/locales';

export const DEFAULT_LOCALE = 'en';
export const PREFERRED_LOCALE_STORAGE_KEY = 'aspire-preferred-locale';
export const LOCALE_PATH_SEGMENT_PATTERN_SOURCE = '[a-z]{2}(?:-[a-z]{2,4})?';
export const LOCALE_PATH_PREFIX_PATTERN_SOURCE = `^/(${LOCALE_PATH_SEGMENT_PATTERN_SOURCE})(?=/|$)`;

type LocaleConfig = { lang: string };

function getLocalePathSegment(key: string): string {
  return key === 'root' ? DEFAULT_LOCALE : key.toLowerCase();
}

const localeAliasEntries = Object.entries(locales as Record<string, LocaleConfig>).flatMap(
  ([key, config]) => {
    const pathSegment = getLocalePathSegment(key);
    return [
      [pathSegment, pathSegment],
      [config.lang.toLowerCase(), pathSegment],
    ] as const;
  }
);

export const localeAliases = Object.fromEntries(localeAliasEntries);
const localeAliasMap = new Map(localeAliasEntries);
const localePathPrefixPattern = new RegExp(LOCALE_PATH_PREFIX_PATTERN_SOURCE, 'i');

export function normalizeLocale(value?: string | null): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const exactMatch = localeAliasMap.get(normalized);
  if (exactMatch) {
    return exactMatch;
  }

  const primaryLanguage = normalized.split('-')[0];
  return primaryLanguage ? localeAliasMap.get(primaryLanguage) : undefined;
}

export function getLocaleFromPath(pathname: string): string | undefined {
  const match = ensureLeadingSlash(pathname).match(localePathPrefixPattern);
  return match?.[1] ? normalizeLocale(match[1]) : undefined;
}

export function stripLocaleFromPath(pathname: string): string {
  const normalizedPathname = ensureLeadingSlash(pathname);
  if (!getLocaleFromPath(normalizedPathname)) {
    return normalizedPathname;
  }

  return normalizedPathname.replace(localePathPrefixPattern, '') || '/';
}

export function addLocaleToPath(pathname: string, locale?: string | null): string {
  const normalizedLocale = normalizeLocale(locale) ?? DEFAULT_LOCALE;
  const unlocalizedPath = stripLocaleFromPath(pathname);

  if (normalizedLocale === DEFAULT_LOCALE) {
    return unlocalizedPath;
  }

  return `/${normalizedLocale}${unlocalizedPath}`;
}

export function appendSearchAndHash(pathname: string, search = '', hash = ''): string {
  return `${pathname}${search}${hash}`;
}

function ensureLeadingSlash(pathname: string): string {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}
