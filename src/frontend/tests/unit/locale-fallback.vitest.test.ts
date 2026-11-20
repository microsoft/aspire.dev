import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { isExcludedFromLinkValidation } from '../../config/links-validator-exclude.mjs';
import { getLocaleFallbackDevPath } from '../../config/locale-fallback-dev-integration.mjs';
import { getTranslatedPaths } from '../../config/translated-paths.mjs';
import {
  collectSidebarLabelTranslations,
  getFallbackLocale,
  getLocaleFallbackDictionaryPath,
  localizeHref,
  translateUiText,
} from '../../src/utils/locale-fallback';
import { hashLocaleFallbackDictionaries } from '../../src/utils/locale-fallback-version';
import { isTranslatedPath } from '../../src/utils/translated-routes';

describe('dictionary versioning', () => {
  test('getLocaleFallbackDictionaryPath appends the version only when given', () => {
    expect(getLocaleFallbackDictionaryPath('de')).toBe('/locale-fallback/de.json');
    expect(getLocaleFallbackDictionaryPath('pt-br', 'abc123')).toBe(
      '/locale-fallback/pt-br.json?v=abc123'
    );
  });

  test('hashLocaleFallbackDictionaries is stable and changes with content', () => {
    const dictionaries = { de: '{"notice":"Hinweis"}', ja: '{"notice":"注意"}' };
    const version = hashLocaleFallbackDictionaries(dictionaries);

    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(hashLocaleFallbackDictionaries({ ja: dictionaries.ja, de: dictionaries.de })).toBe(
      version
    );
    expect(hashLocaleFallbackDictionaries({ ...dictionaries, de: '{"notice":"Neu"}' })).not.toBe(
      version
    );
    expect(hashLocaleFallbackDictionaries({ de: dictionaries.de })).not.toBe(version);
  });
});

describe('getFallbackLocale', () => {
  test('returns the requested locale when the English page is served in place', () => {
    expect(getFallbackLocale('/de/get-started/install-cli/', 'en')).toBe('de');
    expect(getFallbackLocale('/pt-br/get-started/', 'en-US')).toBe('pt-br');
  });

  test.each([
    ['/get-started/install-cli/', 'en'],
    ['/ja/get-started/install-cli/', 'ja'],
    ['/xx/get-started/', 'en'],
    ['/de/', 'de'],
  ])('ignores %s served as %s', (pathname, lang) => {
    expect(getFallbackLocale(pathname, lang)).toBeUndefined();
  });
});

describe('localizeHref', () => {
  test.each([
    ['/get-started/install-cli/', '/de/get-started/install-cli/'],
    ['/docs/?tab=cli#install', '/de/docs/?tab=cli#install'],
    ['/', '/de/'],
  ])('prefixes page link %s', (href, expected) => {
    expect(localizeHref(href, 'de')).toBe(expected);
  });

  test.each([
    'https://github.com/microsoft/aspire',
    '//cdn.example.com/x/',
    '#overview',
    '/ja/get-started/',
    '/hub/',
    '/reference/api/csharp/',
    '/get-started/install-cli.md',
    '/_astro/site.css',
    '/locale-fallback/de.json',
  ])('leaves %s unchanged', (href) => {
    expect(localizeHref(href, 'de')).toBeUndefined();
  });
});

describe('translateUiText', () => {
  const strings = { 'On this page': 'Auf dieser Seite', Same: 'Same' };

  test('translates exact matches and keeps surrounding whitespace', () => {
    expect(translateUiText('\n  On this page ', strings)).toBe('\n  Auf dieser Seite ');
  });

  test.each(['On this page now', '', '   ', 'Same', 'toString'])('ignores %j', (text) => {
    expect(translateUiText(text, strings)).toBeUndefined();
  });
});

test('collectSidebarLabelTranslations reads topic labels and item translations', () => {
  const topics = [
    {
      label: { en: 'Foundations', de: 'Grundlagen' },
      items: [
        {
          label: 'Welcome',
          translations: { de: 'Willkommen', 'pt-BR': 'Bem-vindo' },
          items: ['get-started/overview', { label: 'Untranslated' }],
        },
      ],
    },
  ];

  expect(collectSidebarLabelTranslations(topics, 'de')).toEqual({
    Foundations: 'Grundlagen',
    Welcome: 'Willkommen',
  });
  expect(collectSidebarLabelTranslations(topics, 'pt-BR')).toEqual({ Welcome: 'Bem-vindo' });
});

describe('isExcludedFromLinkValidation', () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'aspire-links-'));
  for (const file of [
    'index.mdx',
    'docs.mdx',
    'get-started/install-cli.mdx',
    'dashboard/index.md',
    'ja/get-started/install-cli.mdx',
  ]) {
    mkdirSync(join(docsDir, file, '..'), { recursive: true });
    writeFileSync(join(docsDir, file), '---\ntitle: T\n---\n');
  }

  test.each([
    '/de/',
    '/de/docs/',
    '/pt-br/get-started/install-cli/#install',
    '/de/dashboard/?tab=x',
    '/de/hub/',
    '/de/reference/api/csharp/',
    '/hub/glossary/ats/',
    '/reference/api/typescript/',
  ])('skips %s', (link) => {
    expect(isExcludedFromLinkValidation(link, docsDir)).toBe(true);
  });

  test.each([
    '/de/not-a-real-page/',
    '/xx/docs/',
    '/docs/',
    '/get-started/install-cli/',
    '/ja/get-started/install-cli/#install',
    'https://example.com/de/docs/',
  ])('validates %s', (link) => {
    expect(isExcludedFromLinkValidation(link, docsDir)).toBe(false);
  });
});

describe('translated paths', () => {
  test('getLocaleFallbackDevPath mirrors StaticHost for untranslated routes', () => {
    const translated = new Set(['/ja/get-started/install-cli/']);
    expect(getLocaleFallbackDevPath('/de/get-started/install-cli/', translated)).toBe(
      '/get-started/install-cli/'
    );
    expect(getLocaleFallbackDevPath('/de/get-started/install-cli.md', translated)).toBe(
      '/get-started/install-cli.md'
    );
    for (const pathname of [
      '/ja/get-started/install-cli/',
      '/ja/get-started/install-cli.md',
      '/de/og/image.png',
      '/de/',
      '/de/get-started',
      '/get-started/install-cli/',
      '/xx/get-started/install-cli/',
      '/de/ja/get-started/install-cli/',
      '/de/de/',
    ]) {
      expect(getLocaleFallbackDevPath(pathname, translated)).toBeUndefined();
    }
  });

  test('getLocaleFallbackDevPath leaves configured redirect sources to Astro', () => {
    const redirectSources = new Set(['/ja/app-host/persistent-containers/']);
    expect(
      getLocaleFallbackDevPath('/ja/app-host/persistent-containers/', new Set(), redirectSources)
    ).toBeUndefined();
    expect(
      getLocaleFallbackDevPath('/de/app-host/persistent-containers/', new Set(), redirectSources)
    ).toBe('/app-host/persistent-containers/');
  });

  test('getTranslatedPaths lists locale docs as route paths', () => {
    const docsDir = mkdtempSync(join(tmpdir(), 'aspire-docs-'));
    try {
      const write = (file: string) => {
        mkdirSync(join(docsDir, file, '..'), { recursive: true });
        writeFileSync(join(docsDir, file), '---\ntitle: T\n---\n');
      };
      write('get-started/install-cli.mdx');
      write('de/index.mdx');
      write('ja/get-started/index.mdx');
      write('ja/get-started/Install-CLI.mdx');
      write('ja/assets/diagram.svg');

      expect(getTranslatedPaths(docsDir)).toEqual([
        '/de/',
        '/ja/get-started/',
        '/ja/get-started/install-cli/',
      ]);
    } finally {
      rmSync(docsDir, { recursive: true, force: true });
    }
  });

  test('isTranslatedPath checks localized routes only', () => {
    const paths = new Set(['/ja/get-started/install-cli/']);
    expect(isTranslatedPath('/get-started/install-cli/', paths)).toBe(true);
    expect(isTranslatedPath('/ja/get-started/install-cli', paths)).toBe(true);
    expect(isTranslatedPath('/de/get-started/install-cli/', paths)).toBe(false);
  });
});
