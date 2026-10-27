import { expect, test } from 'vitest';

import {
  isApiReferencePath,
  normalizeApiReferenceSidebarHref,
  stripApiReferenceLocale,
} from '../../src/utils/api-reference-routes';

test('isApiReferencePath recognizes API page and markdown routes', () => {
  expect(isApiReferencePath('/reference/api/csharp/')).toBe(true);
  expect(isApiReferencePath('/reference/api/typescript/aspire.hosting.md')).toBe(true);
  expect(isApiReferencePath('/fr/reference/api/csharp/')).toBe(true);
  expect(isApiReferencePath('reference/api/csharp/')).toBe(true);
  expect(isApiReferencePath('/reference/overview/')).toBe(false);
});

test('stripApiReferenceLocale returns the canonical API path for localized API URLs', () => {
  expect(stripApiReferenceLocale('/fr/reference/api/csharp/')).toBe('/reference/api/csharp/');
  expect(stripApiReferenceLocale('/ja/reference/api/typescript/')).toBe('/reference/api/typescript/');
  expect(stripApiReferenceLocale('/zh-CN/reference/api/csharp/communitytoolkit.aspire.hosting.activemq.md')).toBe(
    '/reference/api/csharp/communitytoolkit.aspire.hosting.activemq.md'
  );
  expect(stripApiReferenceLocale('/pt-br/reference/api')).toBe('/reference/api');
});

test('stripApiReferenceLocale ignores non-API paths and canonical API paths', () => {
  expect(stripApiReferenceLocale('/fr/reference/overview/')).toBeUndefined();
  expect(stripApiReferenceLocale('/reference/api/csharp/')).toBeUndefined();
  expect(stripApiReferenceLocale('/docs/reference/api-guidance/')).toBeUndefined();
});

test('sidebar canonicalization preserves TypeScript section anchors after Starlight formatting', () => {
  const typePath = '/reference/api/typescript/aspire.hosting.redis/redisresource/';
  expect(normalizeApiReferenceSidebarHref(`${typePath}#properties/`)).toBe(`${typePath}#properties`);
  expect(normalizeApiReferenceSidebarHref(`/fr${typePath}#methods/`)).toBe(`${typePath}#methods`);
  expect(normalizeApiReferenceSidebarHref(`${typePath}withmodule/#defined-on/`)).toBe(
    `${typePath}withmodule/#defined-on`
  );
  expect(normalizeApiReferenceSidebarHref(`${typePath}#properties`)).toBe(`${typePath}#properties`);
  expect(normalizeApiReferenceSidebarHref(typePath)).toBe(typePath);
  expect(normalizeApiReferenceSidebarHref('/fr/reference/api/csharp/')).toBe('/reference/api/csharp/');
  expect(normalizeApiReferenceSidebarHref('/reference/api/csharp/#methods/')).toBe('/reference/api/csharp/#methods/');
  expect(normalizeApiReferenceSidebarHref('/docs/#heading/')).toBe('/docs/#heading/');
  expect(normalizeApiReferenceSidebarHref('https://example.com/#heading/')).toBe('https://example.com/#heading/');
});
