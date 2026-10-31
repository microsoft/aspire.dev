import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { describe, expect, it } from 'vitest';
import { redirects } from '../../config/redirects.mjs';

// starlight-links-validator treats `https://aspire.dev/...` links as external, skips
// bare relative links (`errorOnRelativeLinks: false`) and accepts redirect sources
// without checking their anchors. This test covers those Markdown link forms, plus
// targets that aren't URLs at all, for the English docs every locale falls back to.

const docsDir = fileURLToPath(new URL('../../src/content/docs/', import.meta.url));
const localeDirs = new Set([
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
]);
// Excluded by the links validator config and covered by dedicated tests or generated pages.
const skippedPrefixes = ['/reference/api/', '/hub/', '/i18n/'];
const redirectSources = new Set(Object.keys(redirects));

const collectDocs = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return path.resolve(directory) === path.resolve(docsDir) && localeDirs.has(entry)
        ? []
        : collectDocs(fullPath);
    }
    return /\.mdx?$/.test(entry) ? [fullPath] : [];
  });

const routeOf = (file: string) => {
  const slug = path
    .relative(docsDir, file)
    .split(path.sep)
    .join('/')
    .replace(/\.mdx?$/, '')
    .replace(/(^|\/)index$/, '');
  return slug ? `/${slug}/` : '/';
};

// Code fences are often indented inside <Steps> and lists, so track them line by line.
const proseLines = (source: string) => {
  let fence: string | undefined;
  return source.split('\n').map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && line.trim() === marker) fence = undefined;
      return '';
    }
    if (marker) {
      fence = marker;
      return '';
    }
    return line;
  });
};

const docs = collectDocs(docsDir);
const docsByRoute = new Map(docs.map((file) => [routeOf(file), file]));
const anchorCache = new Map<string, Set<string>>();

const anchorsOf = (file: string) => {
  let anchors = anchorCache.get(file);
  if (!anchors) {
    const slugger = new GithubSlugger();
    const source = proseLines(readFileSync(file, 'utf8')).join('\n');
    anchors = new Set();
    for (const [, heading] of source.matchAll(/^#{2,6}\s+(.+?)\s*$/gm)) {
      const text = heading
        .replace(/<[^>]*>/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[`*_]/g, '')
        .trim();
      anchors.add(slugger.slug(text));
    }
    for (const [, id] of source.matchAll(/\bid=["']([^"']+)["']/g)) anchors.add(id);
    anchorCache.set(file, anchors);
  }
  return anchors;
};

const markdownLinkTarget = /(?<!!)\[[^\]\n]*\]\(([^)\s]+)\)/g;

const findProblems = (file: string) => {
  const source = path.relative(docsDir, file).split(path.sep).join('/');
  const problems: string[] = [];
  proseLines(readFileSync(file, 'utf8')).forEach((line, index) => {
    const at = `${source}:${index + 1}`;
    if (line.includes('[!INCLUDE')) problems.push(`${at}: unsupported [!INCLUDE] directive`);
    for (const [, target] of line.matchAll(/\]\((`[^`)]*`)\)/g)) {
      problems.push(`${at}: ${target} is inline code, not a link target`);
    }
    const withoutCode = line.replace(/`[^`]*`/g, '');
    for (const [, target] of withoutCode.matchAll(markdownLinkTarget)) {
      if (!/^(?:[a-z][a-z0-9+.-]*:|\/|\.|#)/i.test(target)) {
        problems.push(`${at}: ${target} is relative to the page URL; use a root-relative link`);
        continue;
      }
      const url = target.startsWith('/')
        ? new URL(target, 'https://aspire.dev')
        : /^https:\/\/aspire\.dev\//.test(target)
          ? new URL(target)
          : undefined;
      if (!url) continue;
      const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
      if (
        skippedPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
        /\.[a-z0-9]+\/$/i.test(pathname)
      )
        continue;
      const anchor = decodeURIComponent(url.hash.slice(1));
      // Redirect pages use a meta refresh to the bare destination, which drops the anchor.
      if (redirectSources.has(pathname)) {
        if (anchor) problems.push(`${at}: ${target} loses its anchor through a redirect`);
        continue;
      }
      if (!target.startsWith('https://aspire.dev/')) continue;
      const destination = docsByRoute.get(pathname);
      if (!destination) problems.push(`${at}: ${target} resolves to a missing page`);
      else if (anchor && !anchorsOf(destination).has(anchor)) {
        problems.push(`${at}: ${target} points to a missing heading #${anchor}`);
      }
    }
  });
  return problems;
};

describe('English docs Markdown link targets', () => {
  it('finds the English docs', () => {
    expect(docsByRoute.get('/whats-new/aspire-9-4/')).toBeDefined();
    expect(docs.length).toBeGreaterThan(100);
  });

  it('uses resolvable link targets that starlight-links-validator does not check', () => {
    expect(docs.flatMap(findProblems)).toEqual([]);
  });
});
