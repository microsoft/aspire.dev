import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';

import { renderOgImagePng } from '@utils/og-image-renderer';
import { buildSupportOgDetails, parseSupportLifecycle } from '@utils/support-lifecycle';
import { getTopicForEntry } from '@utils/topic-resolver';

/**
 * Open Graph image endpoint for the support policy page.
 *
 * `support.mdx` uses the `splash` template, which the generic `/og/<slug>.png`
 * generator skips, so it would otherwise fall back to the site-wide marketing
 * card. This endpoint renders a data-driven card instead: the supported
 * version, latest patch, and key dates are read from the page's own release
 * tables (see `parseSupportLifecycle`), so every build reflects the current
 * lifecycle without a second place to edit.
 *
 * The page points its `og:image` here through the `ogImage` frontmatter key.
 */

export const prerender = true;

export const GET: APIRoute = async () => {
  const entry = await getEntry('docs', 'support');
  if (!entry?.body) {
    throw new Error('Unable to read the "support" docs entry for its Open Graph image.');
  }

  const lifecycle = parseSupportLifecycle(entry.body);
  if (lifecycle.supported.length === 0) {
    throw new Error(
      'No supported releases were found in support.mdx. Update parseSupportLifecycle if the page structure changed.'
    );
  }

  const png = await renderOgImagePng({
    title: entry.data.title,
    topic: getTopicForEntry('support'),
    details: buildSupportOgDetails(lifecycle),
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      // The URL is stable but the card changes with each release, so it must not be marked immutable.
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
};
