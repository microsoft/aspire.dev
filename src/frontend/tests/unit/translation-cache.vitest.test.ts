import { expect, test, vi } from 'vitest';
import { cacheStaticTranslations } from '../../src/utils/translation-cache';

function translator(dictionary: Record<string, string>) {
  return Object.assign(
    vi.fn((key: string, options?: { count?: number }) => options?.count
      ? `${key}:${options.count}`
      : dictionary[key] ?? `fallback:${key}`),
    {
      all: () => dictionary,
      exists: (key: string) => Object.hasOwn(dictionary, key),
      dir: () => 'ltr' as const,
    },
  );
}

test('reuses plain labels across fixed translators for the same dictionary', () => {
  const dictionary = { label: 'Search' };
  const first = translator(dictionary);
  const second = translator(dictionary);
  const cachedFirst = cacheStaticTranslations(first);
  const cachedSecond = cacheStaticTranslations(second);
  expect(cachedFirst('label')).toBe('Search');
  expect(cachedFirst('label')).toBe('Search');
  expect(cachedSecond('label')).toBe('Search');
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(cachedFirst.all()).toBe(dictionary);
  expect(cachedFirst.exists('label')).toBe(true);
  expect(cachedFirst.dir()).toBe('ltr');
});

test('keeps locales and changed source values isolated', () => {
  const english = { label: 'Search' };
  const french = { label: 'Rechercher' };
  const original = translator(english);
  const cached = cacheStaticTranslations(original);
  expect(cached('label')).toBe('Search');
  expect(cacheStaticTranslations(translator(french))('label')).toBe('Rechercher');
  english.label = 'Find';
  expect(cached('label')).toBe('Find');
  expect(original).toHaveBeenCalledTimes(2);
});

test('does not cache interpolation, nesting, options, or fallback lookups', () => {
  const original = translator({ label: 'Search', interpolation: '{{count}} results', nesting: '$t(label)' });
  const cached = cacheStaticTranslations(original);
  for (let repeat = 0; repeat < 2; repeat++) {
    expect(cached('label', { count: 2 })).toBe('label:2');
    expect(cached('interpolation')).toBe('{{count}} results');
    expect(cached('nesting')).toBe('$t(label)');
    expect(cached('missing')).toBe('fallback:missing');
  }
  expect(original).toHaveBeenCalledTimes(8);
});

test('does not retain failures', () => {
  const original = translator({ label: 'Search' });
  original.mockImplementationOnce(() => { throw new Error('Translation failed'); });
  const cached = cacheStaticTranslations(original);
  expect(() => cached('label')).toThrow('Translation failed');
  expect(cached('label')).toBe('Search');
  expect(original).toHaveBeenCalledTimes(2);
});

test('does not cache transformed results or namespace-qualified keys', () => {
  const original = translator({ label: 'Search', 'other:label': 'Search' });
  original.mockImplementation((key) => key.toUpperCase());
  const cached = cacheStaticTranslations(original);
  expect(cached('label')).toBe('LABEL');
  expect(cached('label')).toBe('LABEL');
  expect(cached('other:label')).toBe('OTHER:LABEL');
  expect(cached('other:label')).toBe('OTHER:LABEL');
  expect(original).toHaveBeenCalledTimes(4);
});
