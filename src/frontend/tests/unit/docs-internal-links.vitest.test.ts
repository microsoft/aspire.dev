import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { describe, expect, it } from 'vitest';

// starlight-links-validator only checks Markdown links and string `href` attributes. It
// skips relative links (`errorOnRelativeLinks: false`) and can't see hrefs passed through
// JSX expression props such as `cta={{ href: '...' }}` or `capabilities={[{ href: '...' }]}`.
// This test covers those two gaps for the English docs, which every locale falls back to.

const root = fileURLToPath(new URL('../../', import.meta.url));
const docsDir = path.join(root, 'src', 'content', 'docs');
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
// Excluded by the links validator config and covered by dedicated API reference/Dev Hub tests.
const skippedPrefixes = ['/reference/api/', '/hub/'];

const collectDocs = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return directory === docsDir && localeDirs.has(entry) ? [] : collectDocs(fullPath);
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
const stripCodeFences = (source: string) => {
  let fence: string | undefined;
  return source
    .split('\n')
    .filter((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
      if (fence) {
        if (
          marker &&
          marker[0] === fence[0] &&
          marker.length >= fence.length &&
          line.trim() === marker
        )
          fence = undefined;
        return false;
      }
      if (marker) {
        fence = marker;
        return false;
      }
      return true;
    })
    .join('\n');
};

// Headings can contain inline JSX such as <abbr title="...">MCP</abbr>; keep only the text.
const stripTags = (value: string) => {
  let text = '';
  let inTag = false;
  for (const character of value) {
    if (character === '<') inTag = true;
    else if (character === '>' && inTag) inTag = false;
    else if (!inTag) text += character;
  }
  return text;
};

const docs = collectDocs(docsDir);
const docsByRoute = new Map(docs.map((file) => [routeOf(file), file]));
const anchorCache = new Map<string, Set<string>>();

const anchorsOf = (file: string) => {
  let anchors = anchorCache.get(file);
  if (!anchors) {
    const slugger = new GithubSlugger();
    const source = stripCodeFences(readFileSync(file, 'utf8'));
    anchors = new Set();
    for (const [, heading] of source.matchAll(/^#{2,6}\s+(.+?)\s*$/gm)) {
      const customId = heading.match(/\{#([^}]+)\}$/)?.[1];
      if (customId) anchors.add(customId);
      const text = stripTags(heading)
        .replace(/\{#[^}]+\}$/, '')
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

const findBrokenLinks = (file: string) => {
  const source = stripCodeFences(readFileSync(file, 'utf8'));
  const route = routeOf(file);
  const links = [
    ...[...source.matchAll(/\bhref:\s*['"]([^'"]+)['"]/g)].map(([, href]) => href),
    ...[...source.matchAll(/\]\((\.{1,2}\/[^)\s]*)\)/g)].map(([, href]) => href),
  ];
  const problems: string[] = [];
  for (const href of links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
    const [target, anchor] = href.split('#');
    const pathname = new URL(target, `https://aspire.dev${route}`).pathname;
    if (
      skippedPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
      /\.[a-z0-9]+$/i.test(pathname)
    )
      continue;
    const destination = docsByRoute.get(pathname.endsWith('/') ? pathname : `${pathname}/`);
    const source = path.relative(docsDir, file).split(path.sep).join('/');
    if (!destination) {
      problems.push(`${source}: ${href} resolves to missing page ${pathname}`);
    } else if (anchor && !anchorsOf(destination).has(anchor)) {
      problems.push(`${source}: ${href} points to a missing heading #${anchor}`);
    }
  }
  return problems;
};

describe('English docs internal links not covered by starlight-links-validator', () => {
  it('finds the English docs', () => {
    expect(docsByRoute.get('/dashboard/explore/')).toBeDefined();
    expect(docs.length).toBeGreaterThan(100);
  });

  it('resolves expression-prop hrefs and relative links to existing pages and headings', () => {
    expect(docs.flatMap(findBrokenLinks)).toEqual([]);
  });
});
