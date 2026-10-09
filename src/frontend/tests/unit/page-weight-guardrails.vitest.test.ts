import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * Guardrails for two mistakes that quietly added render-blocking CSS and early requests to
 * every first view of the site. Both are invisible in review and only show up in a
 * Lighthouse run, so they are checked statically.
 */
const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));

function* astroFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* astroFiles(path);
    else if (entry.name.endsWith('.astro')) yield path;
  }
}

/** The template part of an .astro file, without its `---` frontmatter fence. */
function template(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
}

/** Whether a bundled (not `is:inline`) <script> has a side-effect CSS import. */
function importsCssFromBundledScript(source: string): boolean {
  const bundledScript =
    /<script(?![^>]*(?:\bis:inline\b|\bsrc=|\bdefine:vars\b))[^>]*>([\s\S]*?)<\/script>/g;
  const cssSideEffectImport = /^\s*import\s+['"][^'"]+\.css(?:\?[^'"]*)?['"]/m;
  return [...template(source).matchAll(bundledScript)].some(([, body]) =>
    cssSideEffectImport.test(body)
  );
}

/** Whether markup or a props object opts an image out of lazy loading. */
function optsOutOfLazyLoading(source: string): boolean {
  // `(?<![.\w])` skips property assignments such as `image.loading = 'eager'` in client scripts;
  // the braced alternative also catches conditional values like `loading={first ? 'eager' : 'lazy'}`.
  return /(?<![.\w])loading\s*(?:=\s*\{[^}]*|[=:]\s*)['"]eager['"]/.test(source);
}

const files = [...astroFiles(srcDir)].map((path) => ({
  name: relative(srcDir, path).split(sep).join('/'),
  source: readFileSync(path, 'utf8'),
}));

describe('page weight guardrails', () => {
  test('components import CSS in their frontmatter, never from a bundled <script>', () => {
    // A side-effect CSS import inside a bundled <script> is attached to the whole docs route
    // (Astro follows dynamic importers), so every page pays for a stylesheet only a few use.
    // The same import in the frontmatter is attached only to the pages that render the component.
    const offenders = files
      .filter(({ source }) => importsCssFromBundledScript(source))
      .map(({ name }) => name);

    expect(offenders, 'Move the CSS import into the component frontmatter').toEqual([]);
  });

  test('only the first-viewport images opt out of lazy loading', () => {
    // On HTTP/1.1 every eager request shares the connection pool with the render-blocking CSS and
    // fonts. Icons far below the fold were eager, which more than doubled the landing page's
    // initial request count. Astro's <Image> is lazy by default, so only the LCP image needs this.
    const allowed = new Set([
      'components/NotFoundPage.astro',
      'components/home/HomeHero.astro',
      'components/starlight/Hero.astro',
    ]);

    const offenders = files
      .filter(({ name, source }) => !allowed.has(name) && optsOutOfLazyLoading(source))
      .map(({ name }) => name);

    expect(offenders, 'Leave below-the-fold images lazy (the default)').toEqual([]);
  });

  describe('the checks flag the mistakes they exist for', () => {
    test('CSS imported from a bundled script', () => {
      expect(
        importsCssFromBundledScript("---\n---\n<script>\n  import 'pkg/player.css';\n</script>")
      ).toBe(true);
      expect(
        importsCssFromBundledScript(
          "---\nimport 'pkg/player.css';\n---\n<script>\n  run();\n</script>"
        )
      ).toBe(false);
      expect(
        importsCssFromBundledScript(
          "---\n// not a <script> import\nimport 'pkg/player.css';\n---\n<script>\n  run();\n</script>"
        )
      ).toBe(false);
      expect(
        importsCssFromBundledScript(
          "---\n---\n<script is:inline>\n  import 'pkg/player.css';\n</script>"
        )
      ).toBe(false);
    });

    test('images that opt out of lazy loading', () => {
      expect(optsOutOfLazyLoading('<Image src={icon} loading="eager" />')).toBe(true);
      expect(
        optsOutOfLazyLoading("<Image src={icon} loading={index === 0 ? 'eager' : 'lazy'} />")
      ).toBe(true);
      expect(optsOutOfLazyLoading("const props = { loading: 'eager' as const };")).toBe(true);
      expect(optsOutOfLazyLoading("images.forEach((image) => { image.loading = 'eager'; });")).toBe(
        false
      );
      expect(optsOutOfLazyLoading('<Image src={icon} loading="lazy" />')).toBe(false);
    });
  });
});
