import { afterEach, describe, expect, test, vi } from 'vitest';
import { select } from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';

import Header from '@components/starlight/Header.astro';
import { renderComponent } from './astro-test-utils';

afterEach(() => vi.unstubAllEnvs());

function renderHeader() {
  const t = Object.assign((key: string) => key, {
    dir: (): 'ltr' => 'ltr',
    all: () => ({}),
  });
  const starlightRoute = {
    siteTitle: 'Aspire',
    siteTitleHref: '/',
    editUrl: '',
    entry: { id: 'test', slug: 'test', filePath: 'test.mdx', data: {} },
  };
  return renderComponent(Header, { locals: { t, starlightRoute } });
}

describe('Header environment badge', () => {
  test.each([
    { dev: true, value: undefined, expected: 'localhost' },
    { dev: false, value: undefined, expected: undefined },
    { dev: true, value: '', expected: undefined },
    { dev: false, value: '', expected: undefined },
    { dev: true, value: '   ', expected: undefined },
    { dev: false, value: '   ', expected: undefined },
    { dev: true, value: 'test', expected: 'test' },
    { dev: false, value: 'staging', expected: 'staging' },
    { dev: false, value: ' release/13.6 ', expected: 'release/13.6' },
  ])('renders $expected with DEV=$dev and value=$value', async ({ dev, value, expected }) => {
    vi.stubEnv('DEV', dev);
    vi.stubEnv('PUBLIC_ENVIRONMENT_BADGE', value);

    const html = await renderHeader();
    if (expected) {
      expect(html).toContain(`>${expected}</span>`);
      expect(html).toContain('class="environment-badge ');
      expect(html.indexOf('class="environment-badge ')).toBeGreaterThan(
        html.indexOf('class="site-title ')
      );
    } else {
      expect(html).not.toContain('class="environment-badge ');
    }
  });

  test('escapes the configured value rather than rendering HTML', async () => {
    vi.stubEnv('PUBLIC_ENVIRONMENT_BADGE', '<img src=x onerror=alert(1)>');

    const html = await renderHeader();
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const badge = select('.environment-badge', unified().use(rehypeParse).parse(html));
    expect(badge?.children).toMatchObject([
      { type: 'text', value: '<img src=x onerror=alert(1)>' },
    ]);
  });
});
