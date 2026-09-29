import { expect, it, vi } from 'vitest';
import PageTitle from '@components/starlight/PageTitle.astro';
import { renderComponent } from './astro-test-utils';

vi.mock('starlight-page-actions/overrides/PageTitle.astro', () => ({ default: vi.fn() }));

it.each(['/hub/', '/hub/browse/', '/hub/glossary/'])(
  'renders valid inline directory title CSS on %s',
  async (requestPath) => {
    const html = await renderComponent(PageTitle, {
      requestUrl: `https://aspire.dev${requestPath}`,
    });
    const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1].trim();
    expect(css).toBeDefined();
    expect(css).toMatch(/^\.content-panel:has\(\.dev-directory-title\)/);
    expect(css).toContain('padding: 1.5rem 1rem');
    expect(css).toContain('margin: 0');
    expect(css).toContain('padding-inline: 1.5rem');
    expect(css).not.toMatch(/`|&#96;|&grave;/);
  },
);
