import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

import {
  isDefaultLocaleEntry,
  shouldSkipDynamicOgImage,
} from '@utils/page-metadata';
import { renderOgImagePng } from '@utils/og-image-renderer';
import { getTopicForEntry } from '@utils/topic-resolver';

/**
 * Per-page Open Graph image endpoint.
 *
 * Emits one PNG per default-locale docs entry at `/og/<slug>.png`. Each image
 * uses the site's marketing `og-image.png` as the full-bleed background and
 * layers a translucent overlay card containing the topic pill, the page
 * title, and (when present) a short page description. The same layout is
 * produced for every page so previews on Discord, Slack, Twitter, and
 * LinkedIn all read identically.
 *
 * Non-default-locale entries reuse the site-wide `og-image.png` (see
 * `src/utils/page-metadata.ts`), so they aren't enumerated here.
 *
 * The set of skipped entries is kept in sync with `shouldSkipDynamicOgImage`
 * so that meta-tag URLs always resolve to real files at build time.
 */

interface OgEntryProps {
  title: string;
  description?: string;
  topicId: string;
  topicLabel: string;
  topicIconSvg: string;
}

export async function getStaticPaths() {
  const docs = await getCollection('docs');
  const paths: Array<{ params: { slug: string }; props: OgEntryProps }> = [];

  for (const entry of docs) {
    if (!isDefaultLocaleEntry(entry.id)) continue;

    const contentBasePath = entry.id.replace(/\\/g, '/').replace(/\.mdx?$/i, '');
    if (
      shouldSkipDynamicOgImage(
        {
          entry: {
            id: entry.id,
            data: entry.data as unknown as Record<string, unknown>,
          },
        } as unknown as Parameters<typeof shouldSkipDynamicOgImage>[0],
        contentBasePath
      )
    ) {
      continue;
    }

    const topic = getTopicForEntry(contentBasePath);

    paths.push({
      params: { slug: `${contentBasePath}.png` },
      props: {
        title: entry.data.title,
        description: entry.data.description,
        topicId: topic.id,
        topicLabel: topic.label,
        topicIconSvg: topic.iconSvg,
      },
    });
  }

  return paths;
}

export const GET: APIRoute = async ({ props }) => {
  const data = props as OgEntryProps;
  const png = await renderOgImagePng({
    title: data.title,
    description: data.description,
    topic: {
      id: data.topicId,
      label: data.topicLabel,
      iconName: data.topicId,
      iconSvg: data.topicIconSvg,
    },
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
