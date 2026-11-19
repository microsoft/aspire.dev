// @ts-check
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locales } from './locales.ts';

const defaultDocsDir = fileURLToPath(new URL('../src/content/docs/', import.meta.url));

/** Custom Astro destinations the validator can't see; checked by browser tests instead. */
const customPaths = new Set([
  '/i18n/',
  '/hub/',
  '/hub/glossary/ats/',
  '/get-started/glossary/#polyglot',
]);

const localePrefixes = Object.keys(locales).filter((locale) => locale !== 'root');

/**
 * @param {string} link
 */
function isCustomPath(link) {
  const path = link.split('?')[0];
  return (
    customPaths.has(path) ||
    path === '/reference/api' ||
    path.startsWith('/reference/api/')
  );
}

/**
 * Whether the default-locale docs page for a route exists as content.
 *
 * @param {string} path Route path without locale prefix, hash, or query.
 * @param {string} docsDir
 */
function hasDefaultLocalePage(path, docsDir) {
  const slug = path.replace(/^\/+|\/+$/g, '');
  const base = slug === '' ? 'index' : slug;
  return ['.md', '.mdx', '/index.md', '/index.mdx'].some((suffix) =>
    existsSync(join(docsDir, `${base}${suffix}`))
  );
}

/**
 * Links to untranslated locale routes (e.g. `/de/docs/`) point at pages that
 * aren't built: StaticHost serves the English page in place. Skip those only
 * when the English target exists, so broken links are still reported.
 *
 * @param {string} link
 * @param {string} [docsDir]
 */
export function isExcludedFromLinkValidation(link, docsDir = defaultDocsDir) {
  if (isCustomPath(link)) return true;

  const match = /^\/([^/?#]+)(\/[^?#]*)?/.exec(link);
  if (!match || !localePrefixes.includes(match[1])) return false;

  const unlocalized = match[2] ?? '/';
  const unlocalizedLink = `${unlocalized}${link.slice(match[0].length)}`;
  if (isCustomPath(unlocalizedLink)) return true;

  return hasDefaultLocalePage(unlocalized, docsDir);
}
