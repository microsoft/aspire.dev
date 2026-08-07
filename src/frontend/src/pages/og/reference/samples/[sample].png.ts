import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { APIRoute } from 'astro';
import sharp from 'sharp';

import samplesJson from '@data/samples.json';
import { renderOgImagePng } from '@utils/og-image-renderer';
import { DEFAULT_OG_IMAGE_HEIGHT, DEFAULT_OG_IMAGE_WIDTH } from '@utils/page-metadata';
import {
  isThemeAwareSampleImage,
  sampleDescriptionText,
  sampleSlug,
  stripSampleImageUrlSuffix,
  type Sample,
  type SampleThumbnail,
} from '@utils/samples';
import { getTopicForEntry } from '@utils/topic-resolver';

/**
 * Per-sample Open Graph image endpoint.
 *
 * Emits one PNG per sample at the stable path `/og/reference/samples/<sample>.png`.
 * The sample detail page (`src/pages/reference/samples/[sample]/index.astro`)
 * points its `og:image` here.
 *
 * Why this exists: `og:image` is emitted as an absolute URL against the
 * canonical `site` (`https://aspire.dev`). Sample detail pages are `src/pages`
 * routes, so the dynamic `/og/<slug>.png` card generator skips them. Pointing
 * `og:image` at the optimized `_astro/<name>.<hash>.webp` thumbnail instead
 * bakes a per-build content hash into that absolute URL, which 404s on any
 * deployment whose build hash differs from production's (e.g. staging serves a
 * hash production never built, and vice versa). Serving the card at a stable,
 * hash-free URL — the same approach the dynamic cards use — lets it resolve
 * regardless of which deployment built the page.
 *
 * Samples with a primary thumbnail render that thumbnail (resized to the
 * canonical 1200×630 social-card dimensions that `page-metadata.ts` declares in
 * `og:image:width`/`og:image:height`). Samples without one fall back to the same
 * branded card the dynamic docs endpoint renders, so every sample still gets a
 * page-specific social card instead of a 404.
 */

export const prerender = true;

interface RouteProps {
  sample: Sample;
}

interface StaticPath {
  params: { sample: string };
  props: RouteProps;
}

/**
 * Resolve a `~/assets/...` thumbnail specifier to an on-disk path under the
 * frontend project root. Paths are resolved against `process.cwd()` (which
 * Astro sets to the frontend root at build time) to mirror `og-image-renderer`
 * and keep working after Vite bundles this module.
 */
function resolveThumbnailPath(thumbnail: string): string {
  const relativePath = stripSampleImageUrlSuffix(thumbnail).replace(
    '~/assets/',
    `${path.join('src', 'assets')}${path.sep}`
  );
  return path.join(process.cwd(), relativePath);
}

function primaryThumbnail(thumbnail: SampleThumbnail): string | null {
  if (isThemeAwareSampleImage(thumbnail)) {
    return thumbnail.light;
  }

  return thumbnail;
}

/** First non-empty line of the cleaned sample description, if any. */
function sampleCardDescription(sample: Sample): string | undefined {
  return (
    sampleDescriptionText(sample.description)
      ?.split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? undefined
  );
}

async function renderSampleOgPng(sample: Sample): Promise<Buffer> {
  const thumbnail = primaryThumbnail(sample.thumbnail);
  if (thumbnail) {
    const source = await readFile(resolveThumbnailPath(thumbnail));
    return sharp(source)
      .resize(DEFAULT_OG_IMAGE_WIDTH, DEFAULT_OG_IMAGE_HEIGHT, {
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toBuffer();
  }

  return renderOgImagePng({
    title: sample.title,
    description: sampleCardDescription(sample),
    topic: getTopicForEntry(`reference/samples/${sampleSlug(sample.name)}`),
  });
}

export function getStaticPaths(): StaticPath[] {
  return (samplesJson as Sample[]).map((sample) => ({
    params: { sample: sampleSlug(sample.name) },
    props: { sample },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const { sample } = props as RouteProps;
  const png = await renderSampleOgPng(sample);

  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
