import { createRenderer } from 'astro-expressive-code';
import { selectAll } from 'hast-util-select';
import { describe, expect, test } from 'vitest';
import ecConfig from '../../ec.config.mjs';

describe('two-slash site-owned popup runtime', () => {
  test('preserves nested popup pairing and code tools without the competing runtime', async () => {
    const renderer = await createRenderer(ecConfig);
    const rendered = await renderer.ec.render({
      code: 'const answer = 42;\nconsole.log(answer);',
      language: 'ts',
      meta: 'twoslash',
    });
    const hovers = selectAll('.twoslash-hover', rendered.renderedGroupAst);
    expect(hovers.length).toBeGreaterThan(0);
    for (const hover of hovers) {
      expect(
        hover.children.some(
          (child) =>
            child.type === 'element' &&
            Array.isArray(child.properties.className) &&
            child.properties.className.includes('twoslash-popup-container')
        )
      ).toBe(true);
    }

    const modules = renderer.jsModules.join('\n');
    expect(modules).not.toContain('twoslash-hover');
    expect(modules).not.toContain('FloatingUIDOM');
    expect(modules).toContain('clipboard');
  });

  test('concurrent SDK blocks retain typed hovers without sharing sample declarations', async () => {
    const renderer = await createRenderer(ecConfig);
    const rendered = await Promise.all(['Redis', 'Postgres'].map((resource) =>
      renderer.ec.render({
        code: `import { createBuilder } from './.aspire/modules/aspire.mjs';\nconst builder = await createBuilder();\nconst resource = await builder.add${resource}('resource');`,
        language: 'typescript',
        meta: 'twoslash',
      }),
    ));
    for (const result of rendered) {
      expect(selectAll('.twoslash-hover', result.renderedGroupAst).length).toBeGreaterThan(0);
      expect(selectAll('.twoslash-error-box', result.renderedGroupAst)).toEqual([]);
    }
  });

  test('concurrent SDK overrides are restored before another block compiles', async () => {
    const renderer = await createRenderer(ecConfig);
    const [, normal] = await Promise.all([
      renderer.ec.render({
        code: '// @filename: .aspire/modules/aspire.mts\nexport const replacement = true;',
        language: 'typescript',
        meta: 'twoslash',
      }),
      renderer.ec.render({
        code: "import { createBuilder } from './.aspire/modules/aspire.mjs';\nconst builder = await createBuilder();",
        language: 'typescript',
        meta: 'twoslash',
      }),
    ]);
    expect(selectAll('.twoslash-hover', normal.renderedGroupAst).length).toBeGreaterThan(0);
    expect(selectAll('.twoslash-error-box', normal.renderedGroupAst)).toEqual([]);
  });

  test('a failed hook does not poison or block the next queued snippet', async () => {
    const renderer = await createRenderer(ecConfig);
    const results = await Promise.allSettled([
      renderer.ec.render({
        code: '// @showEmit\n// @filename: leak.ts\ndeclare const leaked: string;\n// @filename: index.ts\nleaked;',
        language: 'ts',
        meta: 'twoslash',
      }),
      renderer.ec.render({
        code: "import { createBuilder } from './.aspire/modules/aspire.mjs';\nconst builder = await createBuilder();",
        language: 'typescript',
        meta: 'twoslash',
      }),
    ]);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
    if (results[1].status === 'fulfilled') {
      expect(selectAll('.twoslash-error-box', results[1].value.renderedGroupAst)).toEqual([]);
    }
  });
});
