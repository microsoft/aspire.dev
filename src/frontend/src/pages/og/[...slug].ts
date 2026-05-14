import { OGImageRoute } from 'astro-og-canvas';
import { getCollection } from 'astro:content';

import {
  isDefaultLocaleEntry,
  shouldSkipDynamicOgImage,
} from '@utils/page-metadata';

/**
 * Per-page Open Graph image endpoint.
 *
 * Emits one PNG per default-locale docs entry at `/og/<slug>.png`. The
 * rendered image deliberately omits the page description — social-card
 * previews already show the description text next to the image, so
 * duplicating it inside the PNG hurts legibility at the small preview sizes
 * used by Discord, Slack, Twitter, and LinkedIn.
 *
 * Non-default-locale entries reuse the site-wide `og-image.png` (see
 * `src/utils/page-metadata.ts`), so they aren't enumerated here.
 *
 * The set of skipped entries is kept in sync with `shouldSkipDynamicOgImage`
 * so that meta-tag URLs always resolve to real files at build time.
 */

interface PageData {
  title: string;
  topic?: string;
  category?: 'conceptual' | 'quickstart' | 'tutorial' | 'blog' | 'reference' | 'sample';
}

const FONTS_DIR = './src/assets/fonts';
const LOGO_PATH = './src/assets/aspire-logo-og.png';

const docs = await getCollection('docs');

const pages: Record<string, PageData> = {};
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

  pages[contentBasePath] = {
    title: entry.data.title,
    topic: entry.data.topic,
    category: entry.data.category,
  };
}

/**
 * Aspire brand palette taken from `src/styles/site.css`. Values mirror
 * `--aspire-color-*` so the generated cards feel like part of the site.
 */
const COLORS = {
  black: [31, 30, 51] as [number, number, number], // --aspire-color-black
  purple: [81, 43, 212] as [number, number, number], // --aspire-color-purple
  primary: [116, 85, 221] as [number, number, number], // --aspire-color-primary
  secondary: [185, 170, 238] as [number, number, number], // --aspire-color-secondary
};

function formatBadge(page: PageData): string | undefined {
  if (page.topic) return page.topic;
  if (page.category) {
    return page.category.charAt(0).toUpperCase() + page.category.slice(1);
  }
  return undefined;
}

export const { getStaticPaths, GET } = await OGImageRoute({
  param: 'slug',

  pages,

  getImageOptions: (_path, page: PageData) => {
    const badge = formatBadge(page);
    // We render the title only — the badge is appended as a separate line of
    // smaller text via the `description` slot supplied by astro-og-canvas, so
    // we don't need to pull a description into the image. Social cards show
    // the page description as adjacent text.
    return {
      title: page.title,
      description: badge,
      logo: {
        path: LOGO_PATH,
        size: [120, 120] as [number, number],
      },
      bgGradient: [COLORS.black, COLORS.purple],
      border: {
        color: COLORS.primary,
        width: 12,
        side: 'block-end' as const,
      },
      padding: 80,
      font: {
        title: {
          color: [255, 255, 255] as [number, number, number],
          size: 84,
          weight: 'Bold' as const,
          lineHeight: 1.1,
          families: ['Outfit'],
        },
        description: {
          color: COLORS.secondary,
          size: 32,
          weight: 'Normal' as const,
          lineHeight: 1.4,
          families: ['Outfit'],
        },
      },
      fonts: [`${FONTS_DIR}/Outfit-Regular.ttf`, `${FONTS_DIR}/Outfit-Bold.ttf`],
    };
  },
});
