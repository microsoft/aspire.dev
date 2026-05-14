import { expect, test } from '@playwright/test';

/**
 * Smoke tests for the page-specific Open Graph metadata wired up in
 * `src/components/starlight/Head.astro` and the dynamic image endpoint at
 * `src/pages/og/[...slug].ts`.
 *
 * These guard against regressions of microsoft/aspire.dev#507, where every
 * page shipped the same generic marketing-tagline social card.
 */

interface PageExpectation {
  url: string;
  /** Title we expect Starlight to emit in `<meta property="og:title">`. */
  ogTitle: string;
  /** Description we expect Starlight to emit in `<meta property="og:description">`. */
  ogDescription: string;
  /** Path of the per-page OG image (excluding origin). */
  ogImagePath: string;
}

const PAGES: PageExpectation[] = [
  {
    url: '/dashboard/enable-browser-telemetry/',
    ogTitle: 'Enable browser telemetry',
    ogDescription: 'Learn how to enable browser telemetry in the Aspire dashboard.',
    ogImagePath: '/og/dashboard/enable-browser-telemetry.png',
  },
];

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const page of PAGES) {
  test(`emits page-specific Open Graph metadata for ${page.url}`, async ({ request, baseURL }) => {
    const response = await request.get(page.url);
    expect(response.ok(), `${page.url} should return 200`).toBe(true);
    const html = await response.text();

    // Starlight emits the per-page og:title and og:description, so we assert
    // those are present (and accurate) regardless of the order they appear in.
    expect(html).toMatch(
      new RegExp(`<meta\\s+property="og:title"\\s+content="${escape(page.ogTitle)}"`, 'i')
    );
    expect(html).toMatch(
      new RegExp(
        `<meta\\s+property="og:description"\\s+content="${escape(page.ogDescription)}"`,
        'i'
      )
    );

    // Our Head.astro emits the per-page og:image, dimensions, and the full
    // twitter:* card metadata.
    expect(html).toContain(`<meta property="og:image" content="`);
    expect(html).toMatch(
      new RegExp(`<meta\\s+property="og:image"\\s+content="[^"]*${escape(page.ogImagePath)}"`, 'i')
    );
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toMatch(
      new RegExp(`<meta\\s+name="twitter:title"\\s+content="${escape(page.ogTitle)} · Aspire"`, 'i')
    );
    expect(html).toMatch(
      new RegExp(`<meta\\s+name="twitter:image"\\s+content="[^"]*${escape(page.ogImagePath)}"`, 'i')
    );

    // The per-page image must actually resolve.
    const imageUrl = new URL(page.ogImagePath, baseURL).toString();
    const imageResponse = await request.get(imageUrl);
    expect(imageResponse.ok(), `${imageUrl} should resolve to a real PNG`).toBe(true);
    expect(imageResponse.headers()['content-type']).toMatch(/image\/png/i);
  });
}

test('falls back to the site-wide image for the home page', async ({ request, baseURL }) => {
  const response = await request.get('/');
  expect(response.ok(), 'home page should return 200').toBe(true);
  const html = await response.text();

  expect(html).toMatch(
    new RegExp(`<meta\\s+property="og:image"\\s+content="[^"]*${escape('/og-image.png')}"`, 'i')
  );

  const imageResponse = await request.get(new URL('/og-image.png', baseURL).toString());
  expect(imageResponse.ok(), 'the fallback /og-image.png must exist').toBe(true);
});
