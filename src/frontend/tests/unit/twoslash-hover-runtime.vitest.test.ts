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
});
