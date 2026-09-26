import { createGenerator } from 'unocss';
import { expect, test } from 'vitest';
import unoConfig from '../../uno.config';

test.each([
  'i-material-icon-theme:typescript',
  'i-material-icon-theme:nodejs',
  'i-material-icon-theme:react',
  'i-material-icon-theme:folder-src',
  'i-material-icon-theme:folder-src-open',
  'i-starlight-plugin-icons:folder',
  'i-starlight-plugin-icons:folder-open',
  'i-devicon:typescript',
  'i-mdi:book-open-page-variant-outline',
])('%s renders as a sized inline icon', async (icon) => {
  const uno = await createGenerator(unoConfig);
  const { css, matched } = await uno.generate(icon, { safelist: false });

  expect(matched.has(icon)).toBe(true);
  expect(css).toContain('display:inline-block;');
  expect(css).toContain('vertical-align:middle;');
  expect(css).toContain('width:1em;');
  expect(css).toContain('height:1em;');
  expect(css).toMatch(/(?:background|--un-icon):\s*url\(/);
});
