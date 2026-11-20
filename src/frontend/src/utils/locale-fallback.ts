import { locales } from '../../config/locales';
import { isDefaultLocaleOnlyPath } from './default-locale-only-routes';
import {
  addLocaleToPath,
  DEFAULT_LOCALE,
  getLocaleFromPath,
  stripLocaleFromPath,
} from './locale-routes';

/**
 * Untranslated locale routes (for example `/de/get-started/install-cli/`) are
 * not built. The static host serves the English page in place and the client
 * swaps the site chrome to the requested locale with a small per-locale
 * dictionary published at `/locale-fallback/{locale}.json`.
 */
export const LOCALE_FALLBACK_BASE_PATH = '/locale-fallback/';
export const LOCALE_FALLBACK_MANIFEST_PATH = `${LOCALE_FALLBACK_BASE_PATH}locales.json`;

/** Path segments of every non-default locale, for example `de` and `pt-br`. */
export const fallbackLocales: readonly string[] = Object.keys(locales)
  .filter((key) => key !== 'root')
  .map((key) => key.toLowerCase());

export interface LocaleFallbackDictionary {
  /** Locale path segment, for example `pt-br`. */
  locale: string;
  /** BCP-47 language tag, for example `pt-BR`. */
  lang: string;
  /** Localized "this content isn't translated yet" notice. */
  notice: string;
  /** English UI text mapped to its localized text. */
  strings: Record<string, string>;
  /** Localized Pagefind UI strings, in the shape of `site-search[data-translations]`. */
  search: Record<string, string>;
}

export interface LocaleFallbackManifest {
  locales: string[];
}

/**
 * Dictionary URL. `version` is a content hash of every dictionary, so the
 * versioned URL can be cached indefinitely. `locales.json` stays unversioned:
 * StaticHost reads it from disk.
 */
export function getLocaleFallbackDictionaryPath(locale: string, version?: string): string {
  const path = `${LOCALE_FALLBACK_BASE_PATH}${locale}.json`;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

/** Meta tag carrying the dictionary version on English pages. */
export const LOCALE_FALLBACK_VERSION_META = 'aspire-locale-fallback-version';

/**
 * The locale a reader asked for when the page they received is the English
 * page served in place of an untranslated locale route.
 */
export function getFallbackLocale(
  pathname: string,
  documentLang: string | null | undefined,
  supportedLocales: readonly string[] = fallbackLocales
): string | undefined {
  const locale = getLocaleFromPath(pathname);
  if (!locale || locale === DEFAULT_LOCALE || !supportedLocales.includes(locale)) return undefined;
  const servedLocale = (documentLang ?? '').trim().toLowerCase().split('-')[0];
  return servedLocale === DEFAULT_LOCALE ? locale : undefined;
}

const nonPageRoutePrefixes = ['/_astro/', '/pagefind/', LOCALE_FALLBACK_BASE_PATH, '/.well-known/'];

/**
 * Prefix a root-relative page link with `locale` the way Starlight localizes
 * sidebar and navigation links on fallback pages. Returns `undefined` when the
 * link should stay as is: external, already localized, English-only, or a file.
 */
export function localizeHref(href: string, locale: string): string | undefined {
  if (!href.startsWith('/') || href.startsWith('//')) return undefined;

  const match = href.match(/^([^?#]*)(.*)$/);
  const pathname = match?.[1] ?? href;
  const suffix = match?.[2] ?? '';
  if (getLocaleFromPath(pathname)) return undefined;
  if (nonPageRoutePrefixes.some((prefix) => pathname.startsWith(prefix))) return undefined;
  if (isDefaultLocaleOnlyPath(pathname)) return undefined;

  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return undefined;

  return `${addLocaleToPath(stripLocaleFromPath(pathname), locale)}${suffix}`;
}

/**
 * Translate UI text by exact match, preserving surrounding whitespace.
 * Returns `undefined` when there is no translation.
 */
export function translateUiText(
  text: string,
  strings: Readonly<Record<string, string>>
): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || !Object.hasOwn(strings, trimmed)) return undefined;
  const translated = strings[trimmed];
  if (translated === undefined || translated === trimmed) return undefined;
  const leading = text.slice(0, text.indexOf(trimmed));
  const trailing = text.slice(text.indexOf(trimmed) + trimmed.length);
  return `${leading}${translated}${trailing}`;
}

type SidebarConfigNode = unknown;

function getLangLabel(label: unknown, lang: string): string | undefined {
  if (!label || typeof label !== 'object') return undefined;
  const value = (label as Record<string, unknown>)[lang];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Collect English → `lang` label pairs from the sidebar topics config: topic
 * labels (`{ en, de, … }` records) and item labels with `translations`.
 */
export function collectSidebarLabelTranslations(
  nodes: SidebarConfigNode,
  lang: string,
  into: Record<string, string> = {}
): Record<string, string> {
  if (Array.isArray(nodes)) {
    for (const node of nodes) collectSidebarLabelTranslations(node, lang, into);
    return into;
  }
  if (!nodes || typeof nodes !== 'object') return into;

  const node = nodes as Record<string, unknown>;
  if (node.label && typeof node.label === 'object') {
    const english = getLangLabel(node.label, 'en');
    const translated = getLangLabel(node.label, lang);
    if (english && translated && english !== translated) into[english] ??= translated;
  } else if (typeof node.label === 'string') {
    const translated = getLangLabel(node.translations, lang);
    if (translated && translated !== node.label) into[node.label] ??= translated;
  }

  if (node.items) collectSidebarLabelTranslations(node.items, lang, into);
  return into;
}
