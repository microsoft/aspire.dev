import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import {
  getOgMetadata,
  isHomePagePath,
} from '../../src/utils/page-metadata.ts';

/**
 * SEO Open Graph length guard.
 *
 * Walks every English documentation page and runs it through
 * `getOgMetadata`. Fails the build when the composed `og:title` or
 * `og:description` strays outside the working SEO ranges:
 *
 * - `og:title`        — 30-65 characters (target: 50-60).
 * - `og:description`  — 80-200 characters (target: 110-160).
 *
 * The optimal *target* ranges (50-60 / 110-160) are what social-card
 * scanners like LinkedIn, Twitter, and the Yoast tooling treat as
 * "great". The wider *guard* ranges (30-65 / 80-200) let new docs land
 * with a tighter draft and tighten over time without breaking CI on the
 * first commit. The site-wide truncation cap is already 200.
 *
 * Translated locale pages, partial CLI includes, the home page, splash
 * templates, and the 404 page are intentionally exempt — see
 * `OPT_OUT_PATTERNS` below.
 */

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const docsRoot = path.join(frontendRoot, 'src', 'content', 'docs');

const NON_DEFAULT_LOCALE_PREFIXES = [
  'da',
  'de',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt-br',
  'ru',
  'tr',
  'uk',
  'zh-cn',
] as const;

const localePrefixPattern = new RegExp(
  `^(?:${NON_DEFAULT_LOCALE_PREFIXES.join('|')})(?:/|$)`,
  'i'
);

/**
 * Paths (relative to `src/content/docs/`) that are exempt from the SEO
 * guard. Add a comment explaining why every time you extend this list.
 */
const OPT_OUT_PATTERNS: RegExp[] = [
  // Partial CLI snippets transcluded via <Include relativePath="…">.
  // They are also exposed as routes today; tracked as a separate cleanup
  // (move them to a dedicated collection or `_`-prefix them so they are
  // not routed). Until then they're allowlisted here.
  /^reference\/cli\/includes\//i,
  // Auto-generated API reference pages built from package JSON schemas.
  // Descriptions come from the upstream package metadata, not authored
  // markdown frontmatter, so the guard cannot meaningfully police them.
  /^reference\/api\//i,
  // The 404 page has an intentionally bare title.
  /^404\.mdx?$/i,
];

const OG_TITLE_MIN = 30;
const OG_TITLE_MAX = 65;
const OG_DESCRIPTION_MIN = 80;
const OG_DESCRIPTION_MAX = 200;

const TARGET_TITLE_MIN = 50;
const TARGET_TITLE_MAX = 60;
const TARGET_DESCRIPTION_MIN = 110;
const TARGET_DESCRIPTION_MAX = 160;

const FRONTMATTER_PATTERN = /^\uFEFF?\s*---\r?\n([\s\S]*?)\r?\n---/;

interface PageFrontmatter {
  title?: string;
  description?: string;
  seoTitle?: string;
  template?: string;
  category?: string;
  ogImage?: string;
  og?: boolean;
}

interface InspectedPage {
  contentPath: string;
  ogTitle: string;
  ogDescription: string;
}

function collectMarkdownFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const resolvedPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return collectMarkdownFiles(resolvedPath);
    }
    return /\.(md|mdx)$/i.test(entry.name) ? [resolvedPath] : [];
  });
}

function parseFrontmatter(source: string): PageFrontmatter {
  const match = source.match(FRONTMATTER_PATTERN);
  if (!match) return {};
  const block = match[1] ?? '';
  const data: PageFrontmatter = {};
  let key: keyof PageFrontmatter | undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (!key || buffer.length === 0) return;
    const raw = buffer.join('\n').trim();
    const value = cleanScalar(raw);
    if (value === undefined) return;
    if (key === 'og') {
      (data as Record<string, unknown>)[key] = value === 'true';
    } else {
      (data as Record<string, unknown>)[key] = value;
    }
  };

  for (const line of block.split(/\r?\n/)) {
    const topLevel = /^(?<key>[A-Za-z][A-Za-z0-9_-]*)\s*:\s*(?<val>.*)$/.exec(line);
    if (topLevel && !/^[\t ]/.test(line)) {
      flush();
      const candidate = topLevel.groups?.key as keyof PageFrontmatter | undefined;
      if (
        candidate === 'title' ||
        candidate === 'description' ||
        candidate === 'seoTitle' ||
        candidate === 'template' ||
        candidate === 'category' ||
        candidate === 'ogImage' ||
        candidate === 'og'
      ) {
        key = candidate;
        buffer = [topLevel.groups?.val ?? ''];
      } else {
        key = undefined;
        buffer = [];
      }
    } else if (key) {
      buffer.push(line);
    }
  }
  flush();
  return data;
}

function cleanScalar(value: string): string | undefined {
  const s = value.trim();
  if (s.length === 0) return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s.startsWith('>') || s.startsWith('|')) {
    const lines = s.split(/\r?\n/).slice(1);
    const indented = lines.filter((line) => line.trim().length > 0);
    const minIndent = indented.length
      ? Math.min(...indented.map((line) => line.length - line.trimStart().length))
      : 0;
    const stripped = lines.map((line) =>
      line.length >= minIndent ? line.slice(minIndent) : line.trim()
    );
    if (s.startsWith('|')) return stripped.join('\n').trim();
    return stripped
      .reduce<string[][]>((acc, line) => {
        if (line.trim() === '') acc.push([]);
        else (acc[acc.length - 1] ?? acc[acc.push([]) - 1]).push(line.trim());
        return acc;
      }, [[]])
      .map((paragraph) => paragraph.join(' '))
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
  return s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
}

function relativeContentPath(absoluteFile: string): string {
  return path
    .relative(docsRoot, absoluteFile)
    .replaceAll(path.sep, '/')
    .replace(/^\.\//, '');
}

function isEnglishPage(contentPath: string): boolean {
  return !localePrefixPattern.test(contentPath);
}

function isOptedOut(contentPath: string): boolean {
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(contentPath));
}

function inspectPage(absoluteFile: string): InspectedPage | undefined {
  const contentPath = relativeContentPath(absoluteFile);
  if (!isEnglishPage(contentPath)) return undefined;
  if (isOptedOut(contentPath)) return undefined;

  const source = readFileSync(absoluteFile, 'utf8');
  const fm = parseFrontmatter(source);
  if (!fm.title) return undefined;

  const entryId = contentPath;
  const contentBasePath = contentPath.replace(/\.mdx?$/i, '');
  if (isHomePagePath(contentBasePath)) return undefined;
  if (fm.template === 'splash') return undefined;

  const route = {
    entry: {
      id: entryId,
      slug: contentBasePath,
      filePath: `src/content/docs/${entryId}`,
      body: '',
      data: {
        title: fm.title,
        description: fm.description,
        seoTitle: fm.seoTitle,
        template: fm.template,
        category: fm.category,
        ogImage: fm.ogImage,
        og: fm.og,
      },
    },
    entryMeta: { lang: 'en', dir: 'ltr', locale: undefined },
    head: [],
    lang: 'en',
    locale: undefined,
  } as unknown as Parameters<typeof getOgMetadata>[0];

  const meta = getOgMetadata(route, new URL(`https://aspire.dev/${contentBasePath}/`), 'https://aspire.dev');

  return {
    contentPath,
    ogTitle: meta.ogTitle,
    ogDescription: meta.description,
  };
}

const allFiles = collectMarkdownFiles(docsRoot);
const pages = allFiles
  .map(inspectPage)
  .filter((page): page is InspectedPage => Boolean(page))
  .sort((a, b) => a.contentPath.localeCompare(b.contentPath));

describe('SEO Open Graph length guard', () => {
  test('every English documentation page has an og:title between 30 and 65 characters', () => {
    const violations = pages
      .filter((page) => page.ogTitle.length < OG_TITLE_MIN || page.ogTitle.length > OG_TITLE_MAX)
      .map(
        (page) =>
          `${page.contentPath} (${page.ogTitle.length} chars): "${page.ogTitle}"`
      );

    expect(
      violations,
      [
        'The following pages have an og:title outside the guard range of',
        `${OG_TITLE_MIN}-${OG_TITLE_MAX} characters (target: ${TARGET_TITLE_MIN}-${TARGET_TITLE_MAX}).`,
        'Tighten the visible `title` (preferred) or add an optional `seoTitle`',
        'frontmatter override that lands in the 50-60 character optimal range.',
        '',
      ].join('\n')
    ).toEqual([]);
  });

  test('every English documentation page has an og:description between 80 and 200 characters', () => {
    const violations = pages
      .filter(
        (page) =>
          page.ogDescription.length < OG_DESCRIPTION_MIN ||
          page.ogDescription.length > OG_DESCRIPTION_MAX
      )
      .map(
        (page) =>
          `${page.contentPath} (${page.ogDescription.length} chars): "${page.ogDescription}"`
      );

    expect(
      violations,
      [
        'The following pages have an og:description outside the guard range of',
        `${OG_DESCRIPTION_MIN}-${OG_DESCRIPTION_MAX} characters (target: ${TARGET_DESCRIPTION_MIN}-${TARGET_DESCRIPTION_MAX}).`,
        'Edit the frontmatter `description` so it surfaces keywords from the',
        'article body and lands in the 110-160 character optimal range.',
        '',
      ].join('\n')
    ).toEqual([]);
  });

  test('inventory smoke check', () => {
    // Lightweight sanity check that the test discovered pages — guards
    // against an accidental empty array silently passing the assertions
    // above if the docs root ever moves.
    expect(pages.length).toBeGreaterThan(100);
  });
});
