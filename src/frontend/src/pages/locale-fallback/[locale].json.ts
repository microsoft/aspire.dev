import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { locales } from '../../../config/locales';
import { sidebarTopics } from '../../../config/sidebar/sidebar.topics';
import {
  collectSidebarLabelTranslations,
  fallbackLocales,
  type LocaleFallbackDictionary,
} from '@utils/locale-fallback';

export const prerender = true;

export const getStaticPaths = (() =>
  fallbackLocales.map((locale) => ({ params: { locale } }))) satisfies GetStaticPaths;

const localeLangs = Object.fromEntries(
  Object.entries(locales as Record<string, { lang: string }>).map(([key, value]) => [
    key.toLowerCase(),
    value.lang,
  ])
);
const defaultLang = localeLangs.root ?? 'en';

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

export const GET: APIRoute = async ({ params, locals }) => {
  const locale = params.locale!;
  const lang = localeLangs[locale] ?? locale;
  const { t } = locals;
  // i18next's fixed `t` accepts an `lng` option that overrides its language; the
  // endpoint URL itself (e.g. `/locale-fallback/de.json`) may set the fixed one.
  const translateTo = t as unknown as (key: string, options: { lng: string }) => string;
  const translate = (key: string) => translateTo(key, { lng: lang });

  const uiStrings: Record<string, string> = {};
  for (const key of flattenKeys(t.all())) {
    const english = translateTo(key, { lng: defaultLang });
    if (typeof english !== 'string' || !english.trim() || english.includes('{{')) continue;
    const translated = translate(key);
    if (typeof translated === 'string' && translated.trim() && translated !== english) {
      uiStrings[english.trim()] ??= translated.trim();
    }
  }

  const dictionary: LocaleFallbackDictionary = {
    locale,
    lang,
    notice: translate('i18n.untranslatedContent'),
    // Page titles and sidebar labels take precedence over generic UI strings.
    strings: {
      ...uiStrings,
      ...collectSidebarLabelTranslations(sidebarTopics, lang),
      ...(await collectPageTitleTranslations(locale)),
    },
  };

  return new Response(JSON.stringify(dictionary), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
