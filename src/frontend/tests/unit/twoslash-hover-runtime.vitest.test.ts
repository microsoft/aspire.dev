import { createRenderer } from 'astro-expressive-code';
import { readFileSync } from 'node:fs';
import { selectAll } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import { describe, expect, test, vi } from 'vitest';
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

  test('renders eventing code blocks consistently across repeated passes', async () => {
    const source = readFileSync(
      new URL('../../src/content/docs/app-host/eventing.mdx', import.meta.url),
      'utf8'
    ).replaceAll('\r\n', '\n');
    const blocks = [...source.matchAll(/^```(\S+)([^\n]*)\n([\s\S]*?)^```$/gm)].map(
      ([, language, meta, code]) => ({ language, meta: meta.trim(), code: code.trimEnd() })
    );
    const renderer = await createRenderer(ecConfig);
    const render = async () =>
      Promise.all(
        blocks.map(async (block) => toHtml((await renderer.ec.render(block)).renderedGroupAst))
      );
    const first = await render();
    for (let pass = 0; pass < 3; pass++) expect(await render()).toEqual(first);
  });

  test.each([
    {
      name: 'code',
      code: 'function createBuilder(): IDistributedApplicationBuilder',
      language: 'ts',
      meta: '',
    },
    {
      name: 'nested hover',
      code: "import { createBuilder } from './.aspire/modules/aspire.mjs';\nconst builder = await createBuilder();",
      language: 'ts',
      meta: 'twoslash',
    },
  ])('does not truncate $name highlighting when the build runner is slow', async (block) => {
    const renderer = await createRenderer(ecConfig);
    const expected = toHtml((await renderer.ec.render(block)).renderedGroupAst);
    let clock = Date.now();
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
    try {
      expect(toHtml((await renderer.ec.render(block)).renderedGroupAst)).toBe(expected);
    } finally {
      now.mockRestore();
    }
  });
});
