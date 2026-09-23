import { selectAll } from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';
import { describe, expect, test } from 'vitest';
import { deferAppHostExamples } from '../../config/apphost-examples.mjs';

const csharp = (copyLabel = 'Copy') =>
  `<div class="code-lang-group scoped" data-code-lang="csharp" style="display: none;"><div class="code-variant" data-variant="frontend"><pre>AddProject&lt;Frontend&gt;();</pre><button class="copy">${copyLabel}</button></div></div>`;
const typescript = (copyLabel = 'Copy') =>
  `<div class="code-lang-group scoped" data-code-lang="typescript"><div class="code-variant scoped" data-variant="frontend"><pre>await builder.addViteApp("frontend");</pre><button class="copy">${copyLabel}</button></div><div class="code-variant" data-variant="databaseFrontend"><pre>await builder.addPostgres("database");</pre><button class="copy">${copyLabel}</button></div></div>`;
const prefix = '<!DOCTYPE html><html><head><title>Aspire &amp; apps</title></head><body>';
const suffix = '<p>Other homepage content</p></body></html>';
const homepage = (copyLabel = 'Copy') =>
  `${prefix}<div class="container" data-apphost-builder><h2>AppHost</h2>${csharp(copyLabel)}${typescript(copyLabel)}<label>Typing animation</label></div>${suffix}`;
const html = homepage();

describe('deferred AppHost examples', () => {
  test('keeps only the default frame while preserving other HTML and scoped classes', () => {
    const result = deferAppHostExamples(html);
    const tree = unified().use(rehypeParse).parse(result.html);
    const variants = selectAll('[data-apphost-builder] .code-variant', tree);

    expect(variants).toHaveLength(1);
    expect(variants[0].properties.dataVariant).toBe('frontend');
    expect(result.html).toContain('<div class="code-variant scoped"');
    expect(result.html).toContain('await builder.addViteApp("frontend");');
    expect(result.html).not.toContain('addPostgres');
    expect(result.html.startsWith(prefix)).toBe(true);
    expect(result.html.endsWith(suffix)).toBe(true);
    expect(result.html).toContain('<label>Typing animation</label>');
  });

  test('uses one content-addressed file containing the original highlighted examples', () => {
    const result = deferAppHostExamples(html);

    expect(result.examples).not.toContain('class="copy"');
    expect(result.filename).toMatch(/^apphost-examples\.[a-f0-9]{16}\.html$/);
    expect(result.html).toContain(`data-apphost-examples="/_astro/${result.filename}"`);
    expect(deferAppHostExamples(html).filename).toBe(result.filename);
    expect(deferAppHostExamples(html.replace('addPostgres', 'addSqlServer')).filename).not.toBe(
      result.filename
    );
    expect(deferAppHostExamples(homepage('Kopier')).filename).toBe(result.filename);
  });

  test('fails instead of publishing a broken default preview', () => {
    expect(() => deferAppHostExamples('<main>No builder</main>')).toThrow(
      'missing builder or default example'
    );
    expect(() =>
      deferAppHostExamples(html.replace('data-code-lang="typescript"', 'data-code-lang="unknown"'))
    ).toThrow('missing builder or default example');
  });
});
