import { readFile, writeFile } from 'node:fs/promises';

/** @param {{ languages: Record<string, { page_count: number }> }} entry */
export function serializePagefindEntry(entry) {
  // Pagefind serializes a Rust HashMap, whose iteration order varies per process.
  const languages = Object.fromEntries(
    Object.entries(entry.languages).sort(
      ([left, a], [right, b]) => b.page_count - a.page_count || left.localeCompare(right, 'en')
    )
  );
  return JSON.stringify({ ...entry, languages });
}

export function pagefindManifestIntegration() {
  return {
    name: 'aspire-pagefind-manifest',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const path = new URL('pagefind/pagefind-entry.json', dir);
        const entry = JSON.parse(await readFile(path, 'utf8'));
        await writeFile(path, serializePagefindEntry(entry));
      },
    },
  };
}
