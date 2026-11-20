import { getCollection } from 'astro:content';
import { useTranslations } from '@astrojs/starlight/internal';
import { locales } from '../../config/locales';
import { sidebarTopics } from '../../config/sidebar/sidebar.topics';
import {
  collectSidebarLabelTranslations,
  fallbackLocales,
  type LocaleFallbackDictionary,
} from './locale-fallback';
import { hashLocaleFallbackDictionaries } from './locale-fallback-version';
import { getPagefindTranslations } from './pagefind-translations';

/*
 * Server-only: builds the `/locale-fallback/{locale}.json` dictionaries. The
 * endpoint and the head snippet (which needs their content hash) share this
 * module so the emitted files and the `?v=` version always agree.
 */

const localeLangs = Object.fromEntries(
  Object.entries(locales as Record<string, { lang: string }>).map(([key, value]) => [
    key.toLowerCase(),
    value.lang,
  ])
);
const defaultLang = localeLangs.root ?? 'en';

type Translate = (key: string) => unknown;

/** i18next nests dotted keys (e.g. `header.docs`) when bundles are merged. */
function flattenKeys(bundle: object, prefix = ''): string[] {
  return Object.entries(bundle).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flattenKeys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

/** Map English page titles to their translated titles for pages that have a translation. */
async function collectPageTitleTranslations(locale: string): Promise<Record<string, string>> {
  const docs = await getCollection('docs');
  const englishById = new Map(docs.map((entry) => [entry.id, entry.data]));
  const strings: Record<string, string> = {};

  for (const entry of docs) {
    if (entry.id !== locale && !entry.id.startsWith(`${locale}/`)) continue;
    const englishId = entry.id === locale ? 'index' : entry.id.slice(locale.length + 1);
    const english = englishById.get(englishId);
    if (!english) continue;

    const pairs: Array<[string | undefined, string | undefined]> = [
      [english.title, entry.data.title],
      [english.sidebar?.label, entry.data.sidebar?.label],
    ];
    for (const [from, to] of pairs) {
      if (from && to && from !== to) strings[from] ??= to;
    }
  }

  return strings;
}

async function buildDictionary(locale: string): Promise<LocaleFallbackDictionary> {
  const lang = localeLangs[locale] ?? locale;
  const english = useTranslations(defaultLang);
  const toEnglish = english as unknown as Translate;
  const localized = useTranslations(lang);
  const toLocale = localized as unknown as Translate;

  const uiStrings: Record<string, string> = {};
  for (const key of flattenKeys(english.all())) {
    const source = toEnglish(key);
    if (typeof source !== 'string' || !source.trim() || source.includes('{{')) continue;
    const translated = toLocale(key);
    if (typeof translated === 'string' && translated.trim() && translated !== source) {
      uiStrings[source.trim()] ??= translated.trim();
    }
  }

  return {
    locale,
    lang,
    notice: String(toLocale('i18n.untranslatedContent')),
    // Pagefind's own strings for the locale, overridden by Starlight's as in
    // Starlight's `Search.astro`. Search keeps the English index.
    search: {
      ...getPagefindTranslations(lang),
      placeholder: String(toLocale('search.label')),
      ...Object.fromEntries(
        flattenKeys(localized.all())
          .filter((key) => key.startsWith('pagefind.'))
          .map((key) => [key.slice('pagefind.'.length), String(toLocale(key))])
      ),
    },
    // Page titles and sidebar labels take precedence over generic UI strings.
    strings: {
      ...uiStrings,
      ...collectSidebarLabelTranslations(sidebarTopics, lang),
      ...(await collectPageTitleTranslations(locale)),
    },
  };
}

let serializedDictionaries: Promise<Record<string, string>> | undefined;

/** Every locale dictionary, serialized exactly as the endpoint emits it. */
export function getSerializedLocaleFallbackDictionaries(): Promise<Record<string, string>> {
  const build = () =>
    Promise.all(
      fallbackLocales.map(
        async (locale) => [locale, JSON.stringify(await buildDictionary(locale))] as const
      )
    ).then((entries) => Object.fromEntries(entries));
  // Built once per build worker; the dev server rebuilds so content edits show up.
  if (import.meta.env.DEV) return build();
  serializedDictionaries ??= build();
  return serializedDictionaries;
}

/** Content hash appended as `?v=` to dictionary requests. */
export async function getLocaleFallbackVersion(): Promise<string> {
  return hashLocaleFallbackDictionaries(await getSerializedLocaleFallbackDictionaries());
}
