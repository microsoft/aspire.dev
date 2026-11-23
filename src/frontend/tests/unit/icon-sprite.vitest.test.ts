import { readFile } from 'node:fs/promises';

import { Icon } from '@astrojs/starlight/components';
import { describe, expect, it } from 'vitest';

import { Icons } from '../../node_modules/@astrojs/starlight/components-internals/Icons';
import { renderIconSprite } from '@utils/icon-sprite';
import { normalizeHtml, renderComponent } from './astro-test-utils';

describe('Starlight icon sprite', () => {
  it('matches the icons shipped by the installed Starlight version', async () => {
    const sprite = await readFile(
      new URL('../../src/assets/icons/starlight-icons.sprite.svg', import.meta.url),
      'utf8'
    );

    expect(sprite.replace(/\r\n/g, '\n'), 'Run `bun run icon-sprite`').toBe(
      renderIconSprite(Icons)
    );
  });

  it('references sprite icons instead of inlining their paths', async () => {
    const html = normalizeHtml(
      await renderComponent(Icon, { props: { name: 'github', label: 'GitHub', size: '2rem' } })
    );

    expect(html).toMatch(/<use href="[^"]*starlight-icons\.sprite\.svg#i-github"/);
    expect(html).toContain('aria-label="GitHub"');
    expect(html).toContain('--sl-icon-size: 2rem');
    expect(html).not.toContain(Icons.github);
  });

  it('keeps inlining icons outside the sprite', async () => {
    const html = normalizeHtml(
      await renderComponent(Icon, { props: { name: 'seti:rust', class: 'custom-icon' } })
    );

    expect(html).not.toContain('<use');
    expect(html).toContain(Icons['seti:rust']);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/<svg[^>]*class="custom-icon\b/);
  });
});
