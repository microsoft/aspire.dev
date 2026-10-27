import type { Root, RootContent } from 'mdast';
import { markdownToMdast } from 'satteri';
import { describe, expect, it } from 'vitest';

import {
  getStandaloneImageNodes,
  getThemeImageNodePair,
  isStandaloneSampleImageBlock,
} from '@utils/sample-readme-images';

// These fixtures are intentionally synthetic. They exercise the *structural*
// markdown shapes a sample README can contain — bare images, thumbnails linked
// to a full-size asset (`[![alt](thumb)](full)`), theme suffixes — without
// hard-coding any real file names from the upstream `dotnet/aspire-samples`
// repo, whose asset paths can change independently of this site.

// Parse a README snippet the same way `SampleDetail.astro` does and return the
// first top-level block, so the assertions run against the exact MDAST that
// `satteri` produces rather than a hand-built tree that could drift.
function firstBlock(markdown: string): RootContent {
  const root = markdownToMdast(markdown, {
    features: { gfm: true, frontmatter: false },
  }) as Root;

  const block = root.children[0];
  if (!block) {
    throw new Error('expected the markdown to parse to at least one block');
  }

  return block;
}

// Build the `~/assets/...` src the sample image importer rewrites README images
// to, optionally tagged with a GitHub theme suffix.
function assetSrc(file: string, theme?: 'light' | 'dark'): string {
  const suffix = theme ? `#gh-${theme}-mode-only` : '';
  return `~/assets/samples/example/${file}${suffix}`;
}

// A thumbnail linked to its full-size asset: `[![alt](thumb)](full)`.
function linkedImage(alt: string, src: string, href = './full.png'): string {
  return `[![${alt}](${src})](${href})`;
}

describe('link-wrapped standalone sample images', () => {
  it('unwraps a linked light/dark theme pair to its inner image nodes', () => {
    const lightSrc = assetSrc('screenshot-light.png', 'light');
    const darkSrc = assetSrc('screenshot-dark.png', 'dark');
    const markdown = [
      linkedImage('Screenshot, light theme', lightSrc),
      linkedImage('Screenshot, dark theme', darkSrc),
    ].join('\n');

    const images = getStandaloneImageNodes(firstBlock(markdown));

    expect(images?.map((image) => image.url)).toEqual([lightSrc, darkSrc]);
  });

  it('detects the theme pair from the unwrapped linked images', () => {
    const lightSrc = assetSrc('screenshot-light.png', 'light');
    const darkSrc = assetSrc('screenshot-dark.png', 'dark');
    const markdown = [
      linkedImage('Screenshot, light theme', lightSrc),
      linkedImage('Screenshot, dark theme', darkSrc),
    ].join('\n');

    const pair = getThemeImageNodePair(getStandaloneImageNodes(firstBlock(markdown)) ?? []);

    expect(pair?.light.url).toBe(lightSrc);
    expect(pair?.dark.url).toBe(darkSrc);
  });

  it('treats a linked theme pair as a standalone image block', () => {
    const markdown = [
      linkedImage('Screenshot, light theme', assetSrc('screenshot-light.png', 'light')),
      linkedImage('Screenshot, dark theme', assetSrc('screenshot-dark.png', 'dark')),
    ].join('\n');

    expect(isStandaloneSampleImageBlock(firstBlock(markdown))).toBe(true);
  });

  it('treats a single linked screenshot as a standalone image block', () => {
    const src = assetSrc('screenshot.png');
    const block = firstBlock(linkedImage('Screenshot', src));

    expect(getStandaloneImageNodes(block)?.map((image) => image.url)).toEqual([src]);
    expect(isStandaloneSampleImageBlock(block)).toBe(true);
  });
});

describe('bare (unwrapped) sample images remain standalone', () => {
  it('handles a bare light/dark theme pair', () => {
    const lightSrc = assetSrc('screenshot-light.png', 'light');
    const darkSrc = assetSrc('screenshot-dark.png', 'dark');
    const markdown = [
      `![Screenshot, light theme](${lightSrc})`,
      `![Screenshot, dark theme](${darkSrc})`,
    ].join('\n');

    const images = getStandaloneImageNodes(firstBlock(markdown)) ?? [];

    expect(images.map((image) => image.url)).toEqual([lightSrc, darkSrc]);
    expect(getThemeImageNodePair(images)).not.toBeNull();
    expect(isStandaloneSampleImageBlock(firstBlock(markdown))).toBe(true);
  });

  it('handles a single bare image', () => {
    const src = assetSrc('screenshot.png');
    const block = firstBlock(`![Screenshot](${src})`);

    expect(getStandaloneImageNodes(block)?.map((image) => image.url)).toEqual([src]);
    expect(isStandaloneSampleImageBlock(block)).toBe(true);
  });
});

describe('non-standalone paragraphs are left in the README body', () => {
  it('does not treat a plain text link as an image block', () => {
    const block = firstBlock('[Read the docs](https://example.com/docs)');

    expect(getStandaloneImageNodes(block)).toBeNull();
    expect(isStandaloneSampleImageBlock(block)).toBe(false);
  });

  it('does not treat a linked image mixed with prose as an image block', () => {
    const block = firstBlock(
      `See ${linkedImage('shot', assetSrc('screenshot.png'))} for the full view.`
    );

    expect(getStandaloneImageNodes(block)).toBeNull();
    expect(isStandaloneSampleImageBlock(block)).toBe(false);
  });
});
