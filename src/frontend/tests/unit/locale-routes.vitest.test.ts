import { expect, test } from 'vitest';

import {
  addLocaleToPath,
  appendSearchAndHash,
  getLocaleFromPath,
  normalizeLocale,
  stripLocaleFromPath,
} from '../../src/utils/locale-routes';

test('normalizeLocale maps browser and selector locale values to route segments', () => {
  expect(normalizeLocale('it-IT')).toBe('it');
  expect(normalizeLocale('zh-CN')).toBe('zh-cn');
  expect(normalizeLocale('pt-BR')).toBe('pt-br');
  expect(normalizeLocale('pt')).toBeUndefined();
  expect(normalizeLocale('en-US')).toBe('en');
  expect(normalizeLocale('pt-PT')).toBeUndefined();
});

test('locale path helpers recognize and remove supported locale prefixes', () => {
  expect(getLocaleFromPath('/it/get-started/first-app/')).toBe('it');
  expect(getLocaleFromPath('/zh-CN/docs/')).toBe('zh-cn');
  expect(getLocaleFromPath('/reference/api/csharp/')).toBeUndefined();
  expect(stripLocaleFromPath('/it/reference/overview/')).toBe('/reference/overview/');
  expect(stripLocaleFromPath('/reference/overview/')).toBe('/reference/overview/');
});

test('addLocaleToPath preserves English as the canonical root path', () => {
  expect(addLocaleToPath('/reference/overview/', 'it')).toBe('/it/reference/overview/');
  expect(addLocaleToPath('/it/reference/overview/', 'fr')).toBe('/fr/reference/overview/');
  expect(addLocaleToPath('/it/reference/overview/', 'en')).toBe('/reference/overview/');
});

test('appendSearchAndHash preserves URL query strings and fragments', () => {
  expect(appendSearchAndHash('/it/reference/overview/', '?q=hosting', '#install')).toBe(
    '/it/reference/overview/?q=hosting#install'
  );
  expect(appendSearchAndHash('/reference/api/csharp/', '', '#types')).toBe(
    '/reference/api/csharp/#types'
  );
});
