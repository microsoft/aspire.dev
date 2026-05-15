import { readFile } from 'node:fs/promises';
import path from 'node:path';

import satori from 'satori';
import sharp from 'sharp';

import { DEFAULT_OG_IMAGE_HEIGHT, DEFAULT_OG_IMAGE_WIDTH } from './page-metadata.ts';
import type { TopicMetadata } from './topic-resolver.ts';

/**
 * Per-page Open Graph image renderer.
 *
 * Composes a 1200×630 social card by overlaying a rounded-corner card and a
 * topic pill on top of the site-wide `public/og-image.png` background. Text
 * is laid out with `satori` (which emits an SVG with text rendered as paths
 * via the supplied Outfit fonts) and the SVG is then rasterized to PNG with
 * `sharp`, which is already a project dependency.
 *
 * Buffers (fonts + background image) are loaded once and cached because
 * every static path renders through the same module instance.
 *
 * Paths are resolved against `process.cwd()` (which Astro sets to the
 * frontend project root at build time) rather than `import.meta.url` so
 * that the renderer continues to work after Vite bundles this module into
 * `dist/.prerender/chunks/`.
 */

const FONTS_DIR = path.join('src', 'assets', 'fonts');
const BG_IMAGE_PATH = path.join('public', 'og-image.png');

const CARD_BG = 'rgba(15, 14, 30, 0.82)';
const DESCRIPTION_BG = 'rgba(15, 14, 30, 0.68)';
const TOPIC_PILL_BG = 'rgba(116, 85, 221, 0.96)';
const TITLE_COLOR = '#ffffff';
const DESCRIPTION_COLOR = 'rgb(220, 213, 246)';
const TOPIC_TEXT_COLOR = '#ffffff';

let regularFontPromise: Promise<Buffer> | undefined;
let boldFontPromise: Promise<Buffer> | undefined;
let backgroundDataUriPromise: Promise<string> | undefined;

export interface RenderOgImageInput {
  title: string;
  description?: string;
  topic: TopicMetadata;
}

export async function renderOgImagePng(input: RenderOgImageInput): Promise<Buffer> {
  const [regularFont, boldFont, backgroundDataUri] = await Promise.all([
    loadRegularFont(),
    loadBoldFont(),
    loadBackgroundDataUri(),
  ]);

  const tree = buildTree({
    title: input.title,
    description: input.description?.trim() ? input.description.trim() : undefined,
    topic: input.topic,
    backgroundDataUri,
  });

  const svg = await satori(tree, {
    width: DEFAULT_OG_IMAGE_WIDTH,
    height: DEFAULT_OG_IMAGE_HEIGHT,
    fonts: [
      { name: 'Outfit', data: regularFont, weight: 400, style: 'normal' },
      { name: 'Outfit', data: boldFont, weight: 700, style: 'normal' },
    ],
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') {
        return loadEmojiSvgDataUri(segment);
      }
      return [];
    },
  });

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg';

const emojiSvgCache = new Map<string, Promise<string>>();

/**
 * Converts an emoji grapheme into a Twemoji SVG data URI so that satori can
 * render it via `<img>` instead of asking the Outfit font for a glyph it
 * doesn't have (which is what produced the tofu "X-in-a-box" character for
 * `Contributors 🤝` and `Community Videos 📺`).
 *
 * Results are memoised per Node process so repeated builds within the same
 * `astro build` only fetch each emoji once. On failure (e.g. offline build
 * with no jsdelivr access) we silently swallow the emoji rather than break
 * the entire image — a stripped emoji is much less jarring in a social
 * preview than a missing glyph.
 */
function loadEmojiSvgDataUri(emoji: string): Promise<string> {
  let cached = emojiSvgCache.get(emoji);
  if (cached) return cached;

  cached = (async () => {
    const codepoint = emojiToTwemojiCodepoint(emoji);
    if (!codepoint) return '';

    try {
      const response = await fetch(`${TWEMOJI_BASE}/${codepoint}.svg`);
      if (!response.ok) return '';
      const svg = await response.text();
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    } catch {
      return '';
    }
  })();

  emojiSvgCache.set(emoji, cached);
  return cached;
}

/**
 * Convert a Unicode emoji grapheme to the Twemoji file-name codepoint
 * format: a dash-separated list of hex codepoints. The `U+FE0F` variation
 * selector is dropped unless the emoji is a single-codepoint keycap-style
 * sequence (matches Twemoji's own naming convention).
 */
function emojiToTwemojiCodepoint(emoji: string): string {
  const codepoints: number[] = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp !== undefined) codepoints.push(cp);
  }

  const hasZwj = codepoints.includes(0x200d);
  const stripped = hasZwj ? codepoints : codepoints.filter((cp) => cp !== 0xfe0f);

  return stripped
    .map((cp) => cp.toString(16))
    .filter((s) => s.length > 0)
    .join('-');
}

function loadRegularFont(): Promise<Buffer> {
  if (!regularFontPromise) {
    regularFontPromise = readFile(path.resolve(FONTS_DIR, 'Outfit-Regular.ttf'));
  }
  return regularFontPromise;
}

function loadBoldFont(): Promise<Buffer> {
  if (!boldFontPromise) {
    boldFontPromise = readFile(path.resolve(FONTS_DIR, 'Outfit-Bold.ttf'));
  }
  return boldFontPromise;
}

function loadBackgroundDataUri(): Promise<string> {
  if (!backgroundDataUriPromise) {
    backgroundDataUriPromise = readFile(path.resolve(BG_IMAGE_PATH)).then(
      (buffer) => `data:image/png;base64,${buffer.toString('base64')}`
    );
  }
  return backgroundDataUriPromise;
}

interface TreeInput {
  title: string;
  description?: string;
  topic: TopicMetadata;
  backgroundDataUri: string;
}

function buildTree({ title, description, topic, backgroundDataUri }: TreeInput) {
  return {
    type: 'div',
    props: {
      style: {
        position: 'relative',
        width: DEFAULT_OG_IMAGE_WIDTH,
        height: DEFAULT_OG_IMAGE_HEIGHT,
        display: 'flex',
        fontFamily: 'Outfit',
      },
      children: [
        {
          type: 'img',
          props: {
            src: backgroundDataUri,
            width: DEFAULT_OG_IMAGE_WIDTH,
            height: DEFAULT_OG_IMAGE_HEIGHT,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              objectFit: 'cover',
            },
          },
        },
        // Bottom-to-top gradient ensures the overlay card has high contrast
        // against bright background imagery.
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              backgroundImage:
                'linear-gradient(to top, rgba(15,14,30,0.92) 0%, rgba(15,14,30,0.45) 55%, rgba(15,14,30,0) 100%)',
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              left: 56,
              right: 56,
              bottom: 56,
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            },
            children: [
              topicPill(topic),
              titleBubble(title),
              description ? descriptionBubble(description) : null,
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}

function topicPill(topic: TopicMetadata) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        alignSelf: 'flex-start',
        backgroundColor: TOPIC_PILL_BG,
        color: TOPIC_TEXT_COLOR,
        borderRadius: 999,
        padding: '12px 26px 12px 18px',
        fontSize: 28,
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.32)',
      },
      children: [
        {
          type: 'img',
          props: {
            src: iconDataUri(topic.iconSvg),
            width: 36,
            height: 36,
          },
        },
        topic.label,
      ],
    },
  };
}

function titleBubble(title: string) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        backgroundColor: CARD_BG,
        color: TITLE_COLOR,
        borderRadius: 28,
        padding: '32px 40px',
        maxWidth: '100%',
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
      },
      children: {
        type: 'div',
        props: {
          style: {
            display: '-webkit-box',
            fontSize: pickTitleFontSize(title),
            fontWeight: 700,
            lineHeight: 1.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            lineClamp: 2,
          },
          children: title,
        },
      },
    },
  };
}

function descriptionBubble(description: string) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        backgroundColor: DESCRIPTION_BG,
        color: DESCRIPTION_COLOR,
        borderRadius: 22,
        padding: '20px 32px',
        maxWidth: '92%',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
      },
      children: {
        type: 'div',
        props: {
          style: {
            display: '-webkit-box',
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.35,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            lineClamp: 2,
          },
          children: description,
        },
      },
    },
  };
}

/**
 * Pick a title font size that keeps long titles inside two lines without
 * forcing the ellipsis. The thresholds are tuned for Outfit Bold at the
 * card's content width (~1080 px after padding).
 */
function pickTitleFontSize(title: string): number {
  const length = title.length;
  if (length <= 32) return 64;
  if (length <= 56) return 56;
  if (length <= 80) return 48;
  return 42;
}

function iconDataUri(pathMarkup: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff">${pathMarkup}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Test seam: lets unit tests inject deterministic font buffers. */
export function __setRendererCachesForTests(overrides: {
  regular?: Buffer;
  bold?: Buffer;
  background?: string;
}): void {
  regularFontPromise = overrides.regular ? Promise.resolve(overrides.regular) : regularFontPromise;
  boldFontPromise = overrides.bold ? Promise.resolve(overrides.bold) : boldFontPromise;
  backgroundDataUriPromise = overrides.background
    ? Promise.resolve(overrides.background)
    : backgroundDataUriPromise;
}

