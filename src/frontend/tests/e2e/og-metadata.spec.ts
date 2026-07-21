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
  /**
   * Title we expect in `<meta name="twitter:title">`. Pages that set
   * `seoTitle` reuse that verbatim (no `· Aspire` suffix); pages that
   * rely on the resolver fallback get `${title} · Aspire`.
   */
  twitterTitle: string;
  /** Description we expect Starlight to emit in `<meta property="og:description">`. */
  ogDescription: string;
  /** Path of the per-page OG image (excluding origin). */
  ogImagePath: string;
}

const PAGES: PageExpectation[] = [
  {
    url: '/dashboard/enable-browser-telemetry/',
    ogTitle: 'Enable browser telemetry in the Aspire dashboard today',
    twitterTitle: 'Enable browser telemetry in the Aspire dashboard today',
    ogDescription:
      'Enable browser telemetry in the Aspire dashboard to capture client-side OpenTelemetry logs, traces, and metrics from front-end JavaScript apps.',
    ogImagePath: '/og/dashboard/enable-browser-telemetry.png',
  },
];

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build an order- and whitespace-agnostic matcher for a `<meta>` tag with a
 * specific attribute (`property` or `name`) and `content` value. HTML
 * attribute order is not significant, so the regex accepts either ordering
 * and any amount of internal whitespace.
 */
function metaTagPattern(
  attribute: 'property' | 'name',
  attrValue: string,
  contentValue: string
): RegExp {
  const attrChunk = `${attribute}="${escape(attrValue)}"`;
  const contentChunk = `content="${escape(contentValue)}"`;
  return new RegExp(
    `<meta\\b[^>]*(?:` +
      `${attrChunk}[^>]*${contentChunk}|` +
      `${contentChunk}[^>]*${attrChunk}` +
      `)[^>]*\\/?>`,
    'i'
  );
}

for (const page of PAGES) {
  test(`emits page-specific Open Graph metadata for ${page.url}`, async ({ request, baseURL }) => {
    const response = await request.get(page.url);
    expect(response.ok(), `${page.url} should return 200`).toBe(true);
    const html = await response.text();

    // Starlight emits the per-page og:title and og:description. Match the
    // attribute order both ways so the test does not depend on the HTML
    // serializer's attribute order or whitespace.
    expect(html).toMatch(metaTagPattern('property', 'og:title', page.ogTitle));
    expect(html).toMatch(metaTagPattern('property', 'og:description', page.ogDescription));

    // Our Head.astro emits the per-page og:image, dimensions, and the full
    // twitter:* card metadata.
    expect(html).toMatch(
      new RegExp(
        `<meta\\b[^>]*property="og:image"[^>]*content="[^"]*${escape(page.ogImagePath)}"`,
        'i'
      )
    );
    expect(html).toMatch(metaTagPattern('property', 'og:image:width', '1200'));
    expect(html).toMatch(metaTagPattern('property', 'og:image:height', '630'));
    expect(html).toMatch(metaTagPattern('property', 'og:image:type', 'image/png'));
    expect(html).toMatch(metaTagPattern('name', 'twitter:title', page.twitterTitle));
    expect(html).toMatch(
      new RegExp(
        `<meta\\b[^>]*name="twitter:image"[^>]*content="[^"]*${escape(page.ogImagePath)}"`,
        'i'
      )
    );

    // The per-page image must actually resolve.
    const imageUrl = new URL(page.ogImagePath, baseURL).toString();
    const imageResponse = await request.get(imageUrl);
    expect(imageResponse.ok(), `${imageUrl} should resolve to a real PNG`).toBe(true);
    expect(imageResponse.headers()['content-type']).toMatch(/image\/png/i);
  });
}

test('emits a stable, hash-free og:image for sample detail pages', async ({ request, baseURL }) => {
  // Sample detail pages (`src/pages/reference/samples/[sample]/index.astro`)
  // are `src/pages` routes, so the dynamic `/og/<slug>.png` card generator
  // skips them. They instead point `og:image` at the primary thumbnail served
  // by `src/pages/og/reference/samples/[sample].png.ts`. This must be a stable,
  // hash-free URL — referencing the optimized `_astro/<name>.<hash>.webp` asset
  // bakes a per-build content hash into the absolute (aspire.dev) `og:image`
  // that 404s on any deployment whose build hash differs from production's.
  const ogImagePath = '/og/reference/samples/node-express-redis.png';
  const response = await request.get('/reference/samples/node-express-redis/');
  expect(response.ok(), 'sample detail page should return 200').toBe(true);
  const html = await response.text();

  expect(html).not.toMatch(/<meta\b[^>]*property="og:image"[^>]*content="[^"]*\/_astro\//i);
  expect(html).toMatch(
    new RegExp(`<meta\\b[^>]*property="og:image"[^>]*content="[^"]*${escape(ogImagePath)}"`, 'i')
  );
  expect(html).toMatch(metaTagPattern('property', 'og:image:width', '1200'));
  expect(html).toMatch(metaTagPattern('property', 'og:image:height', '630'));
  expect(html).toMatch(metaTagPattern('property', 'og:image:type', 'image/png'));
  expect(html).toMatch(
    new RegExp(`<meta\\b[^>]*name="twitter:image"[^>]*content="[^"]*${escape(ogImagePath)}"`, 'i')
  );

  // The thumbnail-backed card must actually resolve to a real PNG.
  const imageUrl = new URL(ogImagePath, baseURL).toString();
  const imageResponse = await request.get(imageUrl);
  expect(imageResponse.ok(), `${imageUrl} should resolve to a real PNG`).toBe(true);
  expect(imageResponse.headers()['content-type']).toMatch(/image\/png/i);
});

test('emits a resolvable og:image for samples without a primary thumbnail', async ({
  request,
  baseURL,
}) => {
  // Samples without a primary thumbnail still need a social card. The endpoint
  // renders the same branded fallback the dynamic docs cards use, so the
  // stable og:image URL resolves instead of 404ing.
  const ogImagePath = '/og/reference/samples/custom-resources.png';
  const response = await request.get('/reference/samples/custom-resources/');
  expect(response.ok(), 'thumbnail-less sample page should return 200').toBe(true);
  const html = await response.text();

  expect(html).not.toMatch(/<meta\b[^>]*property="og:image"[^>]*content="[^"]*\/_astro\//i);
  expect(html).toMatch(
    new RegExp(`<meta\\b[^>]*property="og:image"[^>]*content="[^"]*${escape(ogImagePath)}"`, 'i')
  );

  const imageUrl = new URL(ogImagePath, baseURL).toString();
  const imageResponse = await request.get(imageUrl);
  expect(imageResponse.ok(), `${imageUrl} should resolve to a real PNG`).toBe(true);
  expect(imageResponse.headers()['content-type']).toMatch(/image\/png/i);
});

test('falls back to the site-wide image for the home page', async ({ request, baseURL }) => {
  const response = await request.get('/');
  expect(response.ok(), 'home page should return 200').toBe(true);
  const html = await response.text();

  expect(html).toMatch(
    new RegExp(
      `<meta\\b[^>]*property="og:image"[^>]*content="[^"]*${escape('/og-image.png')}"`,
      'i'
    )
  );

  const imageResponse = await request.get(new URL('/og-image.png', baseURL).toString());
  expect(imageResponse.ok(), 'the fallback /og-image.png must exist').toBe(true);
});

test('falls back to the site-wide image for generated API reference pages', async ({
  request,
  baseURL,
}) => {
  const response = await request.get('/reference/api/typescript/aspire.hosting.redis/');
  expect(response.ok(), 'API reference page should return 200').toBe(true);
  const html = await response.text();

  expect(html).toMatch(
    new RegExp(
      `<meta\\b[^>]*property="og:image"[^>]*content="[^"]*${escape('/og-image.png')}"`,
      'i'
    )
  );
  expect(html).not.toMatch(/\/og\/reference\/api\/typescript\//i);

  const imageResponse = await request.get(new URL('/og-image.png', baseURL).toString());
  expect(imageResponse.ok(), 'the fallback /og-image.png must exist').toBe(true);
});
