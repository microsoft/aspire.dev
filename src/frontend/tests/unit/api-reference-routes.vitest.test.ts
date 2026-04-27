import { expect, test } from 'vitest';

import { isApiReferencePath, stripApiReferenceLocale } from '../../src/utils/api-reference-routes';

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
