import { describe, expect, test } from 'vitest';

import Banner from '@components/starlight/Banner.astro';

import { renderComponent, type StarlightRoute } from './astro-test-utils';

const CONTENT = '<strong>Aspire 13.4 is here!</strong> <a href="/whats-new/aspire-13-4/">See what\'s new</a>';

function starlightRouteWith(data: Record<string, unknown>): StarlightRoute {
  return {
    editUrl:
      'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/src/content/docs/test.mdx',
    entry: {
      id: 'docs/test',
      slug: 'test',
      filePath: 'src/content/docs/test.mdx',
      data,
    },
  };
}

function render(data: Record<string, unknown>): Promise<string> {
  return renderComponent(Banner, { locals: { starlightRoute: starlightRouteWith(data) } });
}

describe('Banner.astro rendered output', () => {
  test('carries top-level expiry metadata through to the client controller', async () => {
    // Regression: previously these lived nested under `banner:` and were dropped
    // by Starlight's built-in banner schema, reaching the component as `null`.
    const expiresOn = new Date('2999-01-01T00:00:00.000Z');
    const html = await render({
      banner: { content: CONTENT },
      bannerExpiresOn: expiresOn,
      bannerAutoDismissAfterDays: 14,
    });

    expect(html).toContain('data-aspire-banner');
    expect(html).toContain(`data-expires-on="${expiresOn.getTime()}"`);
    expect(html).toContain('data-auto-dismiss-days="14"');
    // The dismiss/first-seen storage keys are derived from the content only, so
    // they stay stable when expiry values change.
    expect(html).toMatch(/data-first-seen-key="aspire\.dev\.banner\.firstSeen\.[0-9a-f]{12}"/);
  });

  test('renders with empty expiry attributes when no expiry is configured', async () => {
    const html = await render({ banner: { content: CONTENT } });

    expect(html).toContain('data-aspire-banner');
    // Astro serializes an empty-string attribute value as a bare attribute
    // (`data-expires-on`), not `data-expires-on=""`. The client reads it back as
    // `dataset.expiresOn === ''` and treats it as "no expiry configured".
    expect(html).toMatch(/\sdata-expires-on(?=[\s>])/);
    expect(html).toMatch(/\sdata-auto-dismiss-days(?=[\s>])/);
  });

  test('is not rendered once the absolute sunset has already passed at build time', async () => {
    const html = await render({
      banner: { content: CONTENT },
      bannerExpiresOn: new Date('2000-01-01T00:00:00.000Z'),
    });

    expect(html).not.toContain('data-aspire-banner');
    expect(html).not.toContain('Aspire 13.4 is here');
  });
});
