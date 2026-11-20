import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/*
 * Server-only. Pagefind's UI picks its built-in strings from `<html lang>`,
 * which stays `en` on locale fallback pages so search keeps the English index.
 * Its per-language strings are only shipped bundled into `@pagefind/default-ui`
 * (one `// ../translations/{lang}.json` module each), so read them from there
 * and pass them through Pagefind's `translations` option instead.
 */

type PagefindStrings = Record<string, string>;

const translationModulePattern =
  /\/\/ \.\.\/translations\/([\w-]+)\.json\n[\s\S]*?strings: \(\) => (strings\d*)[\s\S]*?\nvar \2 = (\{[\s\S]*?\n\});/g;

let cache: Map<string, PagefindStrings> | undefined;

function loadPagefindTranslations(): Map<string, PagefindStrings> {
  const translations = new Map<string, PagefindStrings>();
  try {
    const require = createRequire(import.meta.url);
    const packageDir = dirname(require.resolve('@pagefind/default-ui/package.json'));
    const source = readFileSync(join(packageDir, 'npm_dist/mjs/ui-core.mjs'), 'utf8');
    for (const [, lang, , literal] of source.matchAll(translationModulePattern)) {
      // The literal is plain data from the installed package.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const evaluate = new Function(`return ${literal}`) as () => PagefindStrings;
      translations.set(lang.toLowerCase(), evaluate());
    }
  } catch {
    // Without them, Pagefind falls back to its English strings.
  }
  return translations;
}

/**
 * Pagefind's built-in UI strings for a BCP-47 tag (for example `pt-BR` falls
 * back to `pt`), or an empty object when Pagefind has none.
 */
export function getPagefindTranslations(lang: string): PagefindStrings {
  cache ??= loadPagefindTranslations();
  const tag = lang.toLowerCase();
  const strings = cache.get(tag) ?? cache.get(tag.split('-')[0]);
  return strings ? { ...strings } : {};
}
