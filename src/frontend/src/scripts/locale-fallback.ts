import {
  getFallbackLocale,
  getLocaleFallbackDictionaryPath,
  LOCALE_FALLBACK_VERSION_META,
  localizeHref,
  translateUiText,
  type LocaleFallbackDictionary,
} from '@utils/locale-fallback';

/**
 * Untranslated locale routes (for example `/de/get-started/install-cli/`) are
 * served by the static host with the English page in place. This module swaps
 * the site chrome to the requested locale, shows the untranslated-content
 * notice, and keeps navigation links in the locale. The page content stays
 * English, so `<html lang>` stays `en` (it also selects the Pagefind index);
 * translated chrome gets its own `lang` attribute.
 */

const dictionaries = new Map<string, Promise<LocaleFallbackDictionary | undefined>>();
const loadedDictionaries = new Map<string, LocaleFallbackDictionary>();

// Page content is English and stays untouched; its aside titles are UI chrome.
const skipSelector =
  'script, style, code, pre, textarea, template, .sl-markdown-content, h1#_top, [data-locale-fallback-skip]';
const contentChromeSelector = '.sl-markdown-content .starlight-aside__title';
const translatedAttributes = ['aria-label', 'title', 'placeholder'];

function loadDictionary(locale: string): Promise<LocaleFallbackDictionary | undefined> {
  const version = document.querySelector<HTMLMetaElement>(
    `meta[name="${LOCALE_FALLBACK_VERSION_META}"]`
  )?.content;
  const url = getLocaleFallbackDictionaryPath(locale, version);
  let dictionary = dictionaries.get(url);
  if (!dictionary) {
    dictionary = fetch(url)
      .then((response) =>
        response.ok ? (response.json() as Promise<LocaleFallbackDictionary>) : undefined
      )
      .then((value) => {
        if (value) loadedDictionaries.set(locale, value);
        return value;
      })
      .catch(() => undefined);
    dictionaries.set(url, dictionary);
  }
  return dictionary;
}

function translateTextNodes(root: Element, dictionary: LocaleFallbackDictionary): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node instanceof Element
        ? node.matches(skipSelector)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP
        : NodeFilter.FILTER_ACCEPT,
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const translated = translateUiText(text.data, dictionary.strings);
    if (translated === undefined) continue;
    text.data = translated;
    text.parentElement?.setAttribute('lang', dictionary.lang);
  }
}

function translateAttributes(dictionary: LocaleFallbackDictionary): void {
  const selector = translatedAttributes.map((name) => `[${name}]`).join(',');
  for (const element of document.body.querySelectorAll(selector)) {
    if (element.closest(skipSelector) && !element.closest(contentChromeSelector)) continue;
    for (const name of translatedAttributes) {
      const value = element.getAttribute(name);
      const translated = value ? translateUiText(value, dictionary.strings) : undefined;
      if (translated !== undefined) element.setAttribute(name, translated);
    }
  }
}

function localizeLinks(locale: string): void {
  for (const anchor of document.body.querySelectorAll<HTMLAnchorElement>(
    'a[href]:not([hreflang])'
  )) {
    if (
      anchor.closest('.sl-markdown-content, starlight-lang-select, [data-locale-fallback-skip]')
    ) {
      continue;
    }
    const localized = localizeHref(anchor.getAttribute('href') ?? '', locale);
    if (localized) anchor.setAttribute('href', localized);
  }
}

function selectLanguage(locale: string): void {
  for (const select of document.querySelectorAll<HTMLSelectElement>(
    'starlight-lang-select select'
  )) {
    const option = Array.from(select.options).find((candidate) =>
      candidate.value.toLowerCase().startsWith(`/${locale}/`)
    );
    if (option) select.value = option.value;
  }
}

function showNotice(dictionary: LocaleFallbackDictionary): void {
  for (const template of document.querySelectorAll<HTMLTemplateElement>(
    'template[data-locale-fallback-notice]'
  )) {
    if (template.previousElementSibling?.hasAttribute('data-locale-fallback-notice-shown')) {
      continue;
    }
    const notice = template.content.firstElementChild?.cloneNode(true);
    if (!(notice instanceof HTMLElement)) continue;
    notice.setAttribute('data-locale-fallback-notice-shown', '');
    notice.setAttribute('lang', dictionary.lang);
    const label = notice.querySelector('[data-locale-fallback-notice-label]');
    if (label) label.textContent = dictionary.notice;
    template.before(notice);
  }
}

function applyDictionary(dictionary: LocaleFallbackDictionary): void {
  const root = document.documentElement;
  if (root.dataset.localeFallback !== dictionary.locale) return;

  translateTextNodes(document.body, dictionary);
  for (const title of document.querySelectorAll(contentChromeSelector)) {
    translateTextNodes(title, dictionary);
  }
  translateAttributes(dictionary);
  localizeLinks(dictionary.locale);
  selectLanguage(dictionary.locale);
  showNotice(dictionary);
  root.dataset.localeReady = '';
}

async function localizePage(): Promise<void> {
  const root = document.documentElement;
  const locale = getFallbackLocale(location.pathname, root.lang);
  if (!locale) {
    delete root.dataset.localeFallback;
    return;
  }
  root.dataset.localeFallback = locale;

  // A cached dictionary applies synchronously, before a swapped-in page paints.
  const dictionary = loadedDictionaries.get(locale) ?? (await loadDictionary(locale));
  if (dictionary) {
    applyDictionary(dictionary);
  } else {
    // Show the English chrome rather than leaving it hidden.
    root.dataset.localeReady = '';
  }
}

void localizePage();
document.addEventListener('astro:after-swap', () => void localizePage());
document.addEventListener('astro:page-load', () => void localizePage());
