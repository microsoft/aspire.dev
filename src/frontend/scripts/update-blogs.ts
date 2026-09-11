import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RootContent } from 'hast';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';

import { fetchWithProxy } from './fetch-with-proxy';

const POSTS_URL = 'https://devblogs.microsoft.com/aspire/wp-json/wp/v2/posts';
const OUTPUT_PATH = fileURLToPath(new URL('../src/data/aspire-blog-posts.json', import.meta.url));
const htmlParser = unified().use(rehypeParse, { fragment: true });
const blockElements = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'dt',
  'dd',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);

export interface AspireBlogPost {
  title: string;
  description: string;
  href: string;
  date: string;
  image?: string;
}

interface FetchOptions {
  fetch?: typeof fetchWithProxy;
  perPage?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function htmlToPlainText(html: string): string {
  function text(node: RootContent): string {
    if (node.type === 'text') return node.value;
    if (node.type !== 'element') return '';
    if (['script', 'style', 'template'].includes(node.tagName)) return '';
    if (node.tagName === 'br') return ' ';
    const content = node.children.map(text).join('');
    return blockElements.has(node.tagName) ? ` ${content} ` : content;
  }

  return htmlParser.parse(html).children.map(text).join('').replace(/\s+/g, ' ').trim();
}

function httpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function normalizePost(value: unknown): { id: number; post: AspireBlogPost } {
  if (
    !record(value) ||
    !positiveId(value.id) ||
    !record(value.title) ||
    typeof value.title.rendered !== 'string' ||
    !record(value.excerpt) ||
    typeof value.excerpt.rendered !== 'string' ||
    !httpUrl(value.link) ||
    typeof value.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value.date) ||
    !Number.isFinite(Date.parse(`${value.date}Z`)) ||
    new Date(`${value.date}Z`).toISOString().slice(0, 19) !== value.date ||
    !(value.featured_media === 0 || positiveId(value.featured_media))
  ) {
    throw new Error('Invalid WordPress post metadata');
  }

  const title = htmlToPlainText(value.title.rendered);
  if (!title) throw new Error(`Empty title for post ${value.id}`);
  const post: AspireBlogPost = {
    title,
    description: htmlToPlainText(value.excerpt.rendered),
    href: value.link,
    date: value.date.slice(0, 10),
  };

  const media = record(value._embedded) ? value._embedded['wp:featuredmedia'] : undefined;
  const featured: unknown = Array.isArray(media)
    ? media.find((item: unknown) => record(item) && item.id === value.featured_media)
    : undefined;
  if (record(featured) && featured.media_type === 'image' && httpUrl(featured.source_url)) {
    post.image = featured.source_url;
  }

  return { id: value.id, post };
}

function totalHeader(value: string | null, name: string): number {
  if (value === null || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`Missing or invalid ${name} pagination header`);
  }
  return Number(value);
}

export async function fetchAspireBlogPosts({
  fetch = fetchWithProxy,
  perPage = 100,
}: FetchOptions = {}): Promise<AspireBlogPost[]> {
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    throw new Error('perPage must be an integer between 1 and 100');
  }
  const posts: AspireBlogPost[] = [];
  const ids = new Set<number>();
  const links = new Set<string>();
  let expectedTotal: number | undefined;
  let expectedPages = 1;

  for (let page = 1; page <= expectedPages; page++) {
    const url = new URL(POSTS_URL);
    url.search = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      order: 'asc',
      orderby: 'id',
      _embed: 'wp:featuredmedia',
      // WordPress requires _links alongside _embedded when filtering fields.
      _fields: 'id,title,excerpt,link,date,featured_media,_links,_embedded',
    }).toString();
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'aspire-blog-ingestion' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Blog page ${page} failed: HTTP ${response.status} ${response.statusText}`);
    }
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`Blog page ${page} did not return JSON`);
    }
    const total = totalHeader(response.headers.get('x-wp-total'), 'X-WP-Total');
    const pages = totalHeader(response.headers.get('x-wp-totalpages'), 'X-WP-TotalPages');
    if (total === 0 || pages !== Math.ceil(total / perPage)) {
      throw new Error(`Invalid archive totals on page ${page}: ${total} posts, ${pages} pages`);
    }
    if (expectedTotal === undefined) {
      expectedTotal = total;
      expectedPages = pages;
    } else if (total !== expectedTotal || pages !== expectedPages) {
      throw new Error(`Archive pagination changed while fetching page ${page}; retry the refresh`);
    }

    const data: unknown = await response.json();
    const expectedCount = Math.min(perPage, total - (page - 1) * perPage);
    if (!Array.isArray(data) || data.length !== expectedCount) {
      throw new Error(`Incomplete blog page ${page}: expected ${expectedCount} posts`);
    }
    for (const value of data) {
      const { id, post } = normalizePost(value);
      if (ids.has(id) || links.has(post.href)) {
        throw new Error(`Duplicate blog post on page ${page}: ${id} (${post.href})`);
      }
      ids.add(id);
      links.add(post.href);
      posts.push(post);
    }
  }

  if (posts.length !== expectedTotal) {
    throw new Error(`Incomplete blog archive: received ${posts.length} of ${expectedTotal} posts`);
  }
  return posts.sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    return a.href < b.href ? -1 : a.href > b.href ? 1 : 0;
  });
}

export async function updateAspireBlogPosts(
  outputPath = OUTPUT_PATH,
  options: FetchOptions = {}
): Promise<AspireBlogPost[]> {
  const posts = await fetchAspireBlogPosts(options);
  // Complete and validate the archive before atomically replacing the previous snapshot.
  const stagingPath = `${outputPath}.${process.pid}.next`;
  try {
    await writeFile(stagingPath, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
    await rename(stagingPath, outputPath);
  } finally {
    await rm(stagingPath, { force: true });
  }
  return posts;
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  updateAspireBlogPosts()
    .then((posts) => {
      console.log(`Saved ${posts.length} Aspire blog posts to ${OUTPUT_PATH}`);
    })
    .catch((error: unknown) => {
      console.error('Failed to update Aspire blog posts:', error);
      process.exitCode = 1;
    });
}
