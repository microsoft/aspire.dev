// @ts-check
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locales } from './locales.ts';

const defaultDocsDir = fileURLToPath(new URL('../src/content/docs/', import.meta.url));

/**
 * Route paths (for example `/ja/get-started/install-cli/`) of every page that
 * has a real translation in a non-default locale. Untranslated locale routes
 * are not built; the static host serves the English page in place.
 *
 * @param {string} [docsDir]
 * @returns {string[]}
 */
export function getTranslatedPaths(docsDir = defaultDocsDir) {
  const paths = new Set();
  for (const locale of Object.keys(locales)) {
    if (locale === 'root') continue;
    const localeDir = join(docsDir, locale);
    if (!existsSync(localeDir)) continue;

    for (const file of readdirSync(localeDir, { recursive: true, encoding: 'utf8' })) {
      if (!/\.mdx?$/i.test(file)) continue;
      const slug = `${locale}/${file.replace(/\\/g, '/').replace(/\.mdx?$/i, '')}`
        .toLowerCase()
        .replace(/\/index$/, '');
      paths.add(`/${slug}/`);
    }
  }
  return [...paths].sort();
}
