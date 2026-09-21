import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  pagefindManifestIntegration,
  serializePagefindEntry,
} from '../../config/pagefind-manifest.mjs';

const languages = {
  en: { hash: 'en_123', wasm: 'en', page_count: 547 },
  de: { hash: 'de_456', wasm: 'de', page_count: 520 },
  ja: { hash: 'ja_789', wasm: null, page_count: 520 },
};
const entry = { version: '1.5.2', languages, include_characters: ['_', '\u203f'] };

describe('Pagefind manifest generation', () => {
  test('emits identical bytes for every language-map insertion order', () => {
    const orders = [
      ['en', 'de', 'ja'],
      ['en', 'ja', 'de'],
      ['de', 'en', 'ja'],
      ['de', 'ja', 'en'],
      ['ja', 'en', 'de'],
      ['ja', 'de', 'en'],
    ] as const;
    for (const order of orders) {
      expect(
        serializePagefindEntry({
          ...entry,
          languages: Object.fromEntries(order.map((language) => [language, languages[language]])),
        })
      ).toBe(JSON.stringify(entry));
    }
  });

  test('preserves all search metadata and the largest-language fallback', () => {
    const result: typeof entry = JSON.parse(serializePagefindEntry(entry));
    expect(result).toEqual(entry);
    expect(Object.values(result.languages).sort((a, b) => b.page_count - a.page_count)[0]).toEqual(
      languages.en
    );
    expect(serializePagefindEntry(result)).toBe(serializePagefindEntry(entry));
  });

  test('finalizes the actual search file and rejects missing or malformed output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aspire-pagefind-'));
    const dir = pathToFileURL(root + sep);
    const finalize = pagefindManifestIntegration().hooks['astro:build:done'];
    try {
      await expect(finalize({ dir })).rejects.toThrow('ENOENT');
      await mkdir(join(root, 'pagefind'));
      const path = join(root, 'pagefind', 'pagefind-entry.json');
      await writeFile(path, '{');
      await expect(finalize({ dir })).rejects.toThrow();
      await writeFile(
        path,
        JSON.stringify({
          ...entry,
          languages: { ja: languages.ja, de: languages.de, en: languages.en },
        })
      );
      await finalize({ dir });
      expect(await readFile(path, 'utf8')).toBe(JSON.stringify(entry));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
