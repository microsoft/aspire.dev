import { describe, expect, test } from 'vitest';

import { getLanguageSwitchPath, getSelectedLocaleForPath } from '../../src/utils/language-switch';

describe('getLanguageSwitchPath', () => {
  test.each([
    ['/get-started/install-cli/', 'de', '/de/get-started/install-cli/'],
    ['/de/get-started/install-cli/', 'ja', '/ja/get-started/install-cli/'],
    ['/de/get-started/install-cli/', 'en', '/get-started/install-cli/'],
    ['/', 'zh-cn', '/zh-cn/'],
    ['/reference/samples/', 'de', '/de/reference/samples/'],
  ])('localizes translated docs route %s for %s', (pathname, locale, expected) => {
    expect(getLanguageSwitchPath(pathname, locale)).toBe(expected);
  });

  test.each([
    ['/hub/', 'de'],
    ['/hub/browse/', 'ja'],
    ['/hub/glossary/apphost/', 'zh-cn'],
    ['/reference/samples/aspire-shop/', 'de'],
    ['/reference/api/csharp/', 'fr'],
  ])('keeps English-only route %s on its English URL for %s', (pathname, locale) => {
    expect(getLanguageSwitchPath(pathname, locale)).toBe(pathname);
  });

  test('canonicalizes a localized API reference URL', () => {
    expect(getLanguageSwitchPath('/fr/reference/api/csharp/', 'de')).toBe('/reference/api/csharp/');
  });
});

describe('getSelectedLocaleForPath', () => {
  test('uses the URL locale on localized routes', () => {
    expect(getSelectedLocaleForPath('/ja/get-started/install-cli/', 'de')).toBe('ja');
  });

  test('uses English on unprefixed translated routes regardless of preference', () => {
    expect(getSelectedLocaleForPath('/get-started/install-cli/', 'de')).toBe('en');
  });

  test.each([
    '/hub/',
    '/hub/glossary/apphost/',
    '/reference/samples/aspire-shop/',
    '/reference/api/csharp/',
  ])('shows the stored preference on English-only route %s', (pathname) => {
    expect(getSelectedLocaleForPath(pathname, 'de')).toBe('de');
    expect(getSelectedLocaleForPath(pathname)).toBe('en');
  });
});
