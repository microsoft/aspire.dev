import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  brandAccents,
  brandAssets,
  brandColors,
  brandCssVariables,
  brandDeckUrl,
  brandFontWeights,
  brandGradients,
  brandSource,
} from '../../src/data/brand';
import { communityTopics } from '../../config/sidebar/community.topics';

const frontendRoot = new URL('../../', import.meta.url);
const docsRoot = new URL('src/content/docs/community/brand/', frontendRoot);
const assetRoot = new URL('public/brand/', frontendRoot);
const pages = ['index.mdx', 'logos.mdx', 'colors.mdx', 'typography.mdx', 'usage.mdx'];

function gitBlobHash(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

describe('official brand snapshot', () => {
  it('records the source revision and exact published artwork bytes', () => {
    expect(brandSource.repository).toBe('https://github.com/microsoft/aspire-brand');
    expect(brandSource.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(brandAssets.filter(({ kind }) => kind === 'logo')).toHaveLength(4);
    expect(brandAssets.filter(({ kind }) => kind === 'icon')).toHaveLength(2);
    expect(brandAssets.filter(({ kind }) => kind === 'developer')).toHaveLength(3);
    expect(new Set(brandAssets.map(({ file }) => file)).size).toBe(9);

    for (const asset of brandAssets) {
      const content = readFileSync(new URL(asset.file, assetRoot));
      expect(gitBlobHash(content), asset.file).toBe(asset.gitBlob);
      expect(content.toString(), asset.file).toContain('<svg');
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
    }

    expect(gitBlobHash(readFileSync(new URL('LICENSE.txt', assetRoot)))).toBe(
      brandSource.licenseBlob
    );
  });

  it('publishes self-contained vector wordmarks with their upstream provenance', () => {
    expect(brandSource.wordmarkGenerator).toBe('scripts/generate-brand-wordmarks.mjs');
    for (const asset of brandAssets.filter(({ kind }) => kind === 'logo')) {
      const svg = readFileSync(new URL(asset.file, assetRoot), 'utf8');
      expect(svg).toContain(`viewBox="0 0 ${asset.width} ${asset.height}"`);
      expect(svg).toContain('<path');
      expect(svg).not.toMatch(/<text\b|<image\b|font-family=|<script\b/);
      expect(asset.sourceGitBlob).toMatch(/^[a-f0-9]{40}$/);
    }
  });

  it('includes exactly the approved SVGs and artwork license, not presentation files', () => {
    const files = readdirSync(fileURLToPath(assetRoot), { recursive: true })
      .filter((file): file is string => typeof file === 'string')
      .map((file) => file.replaceAll('\\', '/'))
      .filter((file) => file.includes('.'));
    expect(files.sort()).toEqual([...brandAssets.map(({ file }) => file), 'LICENSE.txt'].sort());
  });
});

describe('brand reference values', () => {
  it('preserves the complete core palette and supporting accents', () => {
    expect(brandColors.map(({ value }) => value)).toEqual([
      '#7455DD',
      '#512BD4',
      '#B9AAEE',
      '#DCD5F6',
      '#DCE0E8',
      '#1F1E33',
      '#FFFFFF',
    ]);
    expect(brandAccents.map(({ value }) => value)).toEqual([
      '#B30F87',
      '#F65163',
      '#0078D7',
      '#0B7E84',
      '#9B8308',
    ]);
    expect(brandGradients.map(({ value }) => value)).toEqual([
      'linear-gradient(90deg, #7455DD 0%, #B30F87 100%)',
      'linear-gradient(90deg, #0078D7 0%, #7455DD 100%)',
      'linear-gradient(90deg, #F65163 0%, #7455DD 100%)',
      'linear-gradient(90deg, #7455DD 0%, #0B7E84 100%)',
    ]);
  });

  it('generates all sixteen CSS variables from the displayed values', () => {
    const entries = [...brandColors, ...brandAccents, ...brandGradients];
    expect(new Set(entries.map(({ token }) => token)).size).toBe(16);
    expect(brandCssVariables.split('\n')).toHaveLength(18);
    expect(brandCssVariables).toBe(
      `:root {\n${entries.map(({ token, value }) => `  ${token}: ${value.toLowerCase()};`).join('\n')}\n}`
    );
  });

  it('includes all four Poppins weights without changing the global theme', () => {
    expect(brandFontWeights.map(({ weight }) => weight)).toEqual([400, 500, 600, 700]);
    const styles = readFileSync(new URL('src/styles/site.css', frontendRoot), 'utf8');
    for (const { weight } of brandFontWeights) {
      expect(styles).toContain(`@fontsource/poppins/${weight}.css`);
    }
  });
});

describe('brand section integration', () => {
  it('uses a 1200 by 630 overview image while other brand pages keep generated cards', () => {
    const overview = readFileSync(new URL('index.mdx', docsRoot), 'utf8');
    expect(overview).toContain('ogImage: /og/aspire-brand-assets.png');
    const png = readFileSync(new URL('public/og/aspire-brand-assets.png', frontendRoot));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    for (const page of pages.filter((page) => page !== 'index.mdx')) {
      expect(readFileSync(new URL(page, docsRoot), 'utf8')).not.toMatch(/^og(?:Image)?:/m);
    }
  });

  it('exposes all five pages through Community navigation', () => {
    const sidebar = JSON.stringify(communityTopics);
    for (const file of pages) {
      expect(existsSync(new URL(file, docsRoot))).toBe(true);
      const slug =
        file === 'index.mdx' ? 'community/brand' : `community/brand/${file.replace('.mdx', '')}`;
      expect(sidebar).toContain(`"slug":"${slug}"`);
    }
  });

  it('keeps the deck external and link-only', () => {
    expect(brandDeckUrl).toBe(
      'https://microsoft.github.io/aspire-brand/slides/intro/Aspire-Spring26-IntroDeck.pptx'
    );
    const overview = readFileSync(new URL('index.mdx', docsRoot), 'utf8');
    expect(overview).toContain('href={brandDeckUrl}');
    for (const file of pages) {
      expect(readFileSync(new URL(file, docsRoot), 'utf8')).not.toMatch(
        /<iframe|<embed|<object|<AsciinemaPlayer|<.*Presentation/i
      );
    }
  });

  it('keeps ordinary logo restrictions separate from developer-icon permissions', () => {
    const guidance = readFileSync(new URL('usage.mdx', docsRoot), 'utf8');
    const cards = readFileSync(
      new URL('src/components/brand/BrandUsageGuidance.astro', frontendRoot),
      'utf8'
    );
    expect(cards).toContain('except as permitted for the provided developer-icon variants below.');
    expect(cards).toContain('Do not stretch, rotate, or crowd the logo');
    expect(cards).toContain(
      'Recoloring is permitted only under the narrow developer-icon usage permission below.'
    );
    expect(guidance).toContain('Permission is granted to use, reproduce, and redistribute');
    expect(guidance).toContain('does not permit arbitrary redesigns');
    expect(guidance).toContain('CC0 does not waive or license trademark rights');
    expect(guidance).toContain('Do not imply Microsoft or Aspire endorsement');
  });
});
