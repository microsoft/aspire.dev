import { afterEach, expect, test, vi } from 'vitest';

import { getStoredPreference, setStoredPreference } from '../../src/utils/browser-storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('getStoredPreference returns stored values and falls back when missing', () => {
  const storage = {
    getItem: vi.fn((key: string) => (key === 'known-key' ? 'stored-value' : null)),
    setItem: vi.fn(),
  } as unknown as Storage;

  vi.stubGlobal('localStorage', storage);

  expect(getStoredPreference('known-key', 'fallback')).toBe('stored-value');
  expect(getStoredPreference('missing-key', 'fallback')).toBe('fallback');
});

test('storage helpers tolerate blocked localStorage access', () => {
  const storage = {
    getItem: vi.fn(() => {
      throw new Error('blocked');
    }),
    setItem: vi.fn(() => {
      throw new Error('blocked');
    }),
  } as unknown as Storage;

  vi.stubGlobal('localStorage', storage);

  expect(getStoredPreference('known-key', 'fallback')).toBe('fallback');
  expect(() => setStoredPreference('known-key', 'stored-value')).not.toThrow();
});
