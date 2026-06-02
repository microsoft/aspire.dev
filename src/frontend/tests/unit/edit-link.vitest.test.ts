import { describe, expect, it } from 'vitest';
import EditLink from '../../src/components/starlight/EditLink.astro';
import { normalizeHtml, renderComponent, type StarlightRoute } from './astro-test-utils';

describe('starlight EditLink', () => {
  it('normalizes malformed GitHub links by inserting /blob/', async () => {
    const starlightRoute: StarlightRoute = {
      editUrl:
        'https://github.com/microsoft/aspire.dev/main/src/frontend/src/content/docs/whats-new/aspire-13-4.mdx',
      entry: {
        id: 'whats-new/aspire-13-4',
        slug: 'whats-new/aspire-13-4',
        filePath: 'src/content/docs/whats-new/aspire-13-4.mdx',
        data: {},
      },
    };

    const html = normalizeHtml(
      await renderComponent(EditLink, {
        locals: { starlightRoute },
        slots: { default: 'Edit page' },
      })
    );

    expect(html).toContain(
      'href="https://github.com/microsoft/aspire.dev/blob/main/src/frontend/src/content/docs/whats-new/aspire-13-4.mdx"'
    );
  });

  it('preserves valid GitHub edit links', async () => {
    const starlightRoute: StarlightRoute = {
      editUrl:
        'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/src/content/docs/whats-new/aspire-13-4.mdx',
      entry: {
        id: 'whats-new/aspire-13-4',
        slug: 'whats-new/aspire-13-4',
        filePath: 'src/content/docs/whats-new/aspire-13-4.mdx',
        data: {},
      },
    };

    const html = normalizeHtml(
      await renderComponent(EditLink, {
        locals: { starlightRoute },
        slots: { default: 'Edit page' },
      })
    );

    expect(html).toContain(
      'href="https://github.com/microsoft/aspire.dev/edit/main/src/frontend/src/content/docs/whats-new/aspire-13-4.mdx"'
    );
  });
});
