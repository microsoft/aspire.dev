import { beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('@astrojs/starlight/route-data', () => ({
  defineRouteMiddleware: <T>(fn: T) => fn,
}));

import { isDefaultLocaleOnlyPath } from '../../src/utils/default-locale-only-routes';

type HeadEntry = { tag: string; attrs?: Record<string, string>; content?: string };
type Middleware = (context: unknown) => void;

const site = 'https://aspire.dev';
const locales = [
  'en',
  'da',
  'de',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt-BR',
  'ru',
  'tr',
  'uk',
  'zh-CN',
];

let onRequest: Middleware;

beforeAll(async () => {
  ({ onRequest } = (await import('../../src/route-data-middleware')) as unknown as {
    onRequest: Middleware;
  });
});

function starlightHead(pathname: string): HeadEntry[] {
  return [
    { tag: 'link', attrs: { rel: 'canonical', href: `${site}${pathname}` } },
    { tag: 'meta', attrs: { property: 'og:title', content: 'Title' } },
    ...locales.map((lang) => ({
      tag: 'link',
      attrs: {
        rel: 'alternate',
        hreflang: lang,
        href: lang === 'en' ? `${site}${pathname}` : `${site}/${lang.toLowerCase()}${pathname}`,
      },
    })),
    { tag: 'link', attrs: { rel: 'alternate', hreflang: 'x-default', href: `${site}${pathname}` } },
    { tag: 'link', attrs: { rel: 'sitemap', href: '/sitemap-index.xml' } },
  ];
}

function runMiddleware(pathname: string, id: string): HeadEntry[] {
  const head = starlightHead(pathname);
  onRequest({
    url: new URL(pathname, site),
    site: new URL(site),
    locals: {
      starlightRoute: {
        id,
        entry: { id, data: { title: 'Title', description: 'Description' } },
        head,
        sidebar: [],
        pagination: {},
      },
    },
  });
  return head;
}

function hreflangs(head: HeadEntry[]): string[] {
  return head
    .filter(
      (entry) => entry.tag === 'link' && entry.attrs?.rel === 'alternate' && entry.attrs.hreflang
    )
    .map((entry) => entry.attrs!.hreflang);
}

describe('hreflang alternates for default-locale-only routes', () => {
  test.each([
    ['/hub/', 'hub'],
    ['/hub/browse/', 'hub/browse'],
    ['/hub/glossary/apphost/', 'hub/glossary/apphost'],
    ['/reference/api/csharp/', 'reference/api/csharp'],
    ['/reference/api/typescript/aspire.hosting/', 'reference/api/typescript/aspire.hosting'],
    ['/reference/samples/aspire-shop/', 'reference/samples/aspire-shop'],
  ])('removes locale alternates that would 404 on %s', (pathname, id) => {
    const head = runMiddleware(pathname, id);

    expect(hreflangs(head)).toEqual([]);
    expect(head.find((entry) => entry.attrs?.rel === 'canonical')?.attrs?.href).toBe(
      `${site}${pathname}`
    );
    expect(head.some((entry) => entry.attrs?.rel === 'sitemap')).toBe(true);
  });

  test.each([
    ['/get-started/install-cli/', 'get-started/install-cli.mdx'],
    ['/de/get-started/install-cli/', 'de/get-started/install-cli.mdx'],
    ['/reference/samples/', 'reference/samples.mdx'],
    ['/', 'index.mdx'],
  ])('keeps locale alternates on localized docs route %s', (pathname, id) => {
    expect(hreflangs(runMiddleware(pathname, id))).toEqual([...locales, 'x-default']);
  });
});

test('isDefaultLocaleOnlyPath matches only English-only custom page routes', () => {
  expect(isDefaultLocaleOnlyPath('/hub/')).toBe(true);
  expect(isDefaultLocaleOnlyPath('/hub')).toBe(true);
  expect(isDefaultLocaleOnlyPath('hub/glossary/')).toBe(true);
  expect(isDefaultLocaleOnlyPath('/reference/api/csharp/aspire.hosting/')).toBe(true);
  expect(isDefaultLocaleOnlyPath('/reference/samples/aspire-shop/')).toBe(true);

  expect(isDefaultLocaleOnlyPath('/hubble/')).toBe(false);
  expect(isDefaultLocaleOnlyPath('/reference/samples/')).toBe(false);
  expect(isDefaultLocaleOnlyPath('/reference/overview/')).toBe(false);
  expect(isDefaultLocaleOnlyPath('/de/get-started/install-cli/')).toBe(false);
});
