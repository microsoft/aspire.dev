import { rename, rm, writeFile } from 'node:fs/promises';
import { Response } from 'node-fetch';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  fetchAspireBlogPosts,
  htmlToPlainText,
  updateAspireBlogPosts,
} from '../../scripts/update-blogs';
import type { fetchWithProxy } from '../../scripts/fetch-with-proxy';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
}));

function post(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: { rendered: `Post ${id}` },
    excerpt: { rendered: '<p>Learn <strong>Aspire</strong>.</p>' },
    link: `https://devblogs.microsoft.com/aspire/post-${id}/`,
    date: '2026-08-18T15:10:00',
    featured_media: 0,
    ...overrides,
  };
}

function page(data: unknown, total = 3, pages = 2, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'x-wp-total': String(total),
      'x-wp-totalpages': String(pages),
      ...headers,
    },
  });
}

function mockFetch(...responses: Response[]) {
  const fetch = vi.fn<typeof fetchWithProxy>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  return fetch;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('official Aspire blog ingestion', () => {
  test('fetches every page, requests metadata only and sorts deterministically', async () => {
    const fetch = mockFetch(
      page([post(2), post(1)]),
      page([post(3, { date: '2026-08-19T01:02:03' })])
    );
    const posts = await fetchAspireBlogPosts({ fetch, perPage: 2 });
    expect(posts.map((entry) => entry.title)).toEqual(['Post 3', 'Post 1', 'Post 2']);
    expect(posts[0]).toEqual({
      title: 'Post 3',
      description: 'Learn Aspire.',
      href: 'https://devblogs.microsoft.com/aspire/post-3/',
      date: '2026-08-19',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [index, [input, options]] of fetch.mock.calls.entries()) {
      const url = new URL(input);
      expect(url.origin + url.pathname).toBe(
        'https://devblogs.microsoft.com/aspire/wp-json/wp/v2/posts'
      );
      expect(url.searchParams.get('page')).toBe(String(index + 1));
      expect(url.searchParams.get('per_page')).toBe('2');
      expect(url.searchParams.get('orderby')).toBe('id');
      expect(url.searchParams.get('order')).toBe('asc');
      expect(url.searchParams.get('_embed')).toBe('wp:featuredmedia');
      expect(url.searchParams.get('_fields')?.split(',')).not.toContain('content');
      expect(options?.signal).toBeDefined();
    }
  });

  test('decodes named and numeric entities, removes markup and preserves word boundaries', () => {
    expect(
      htmlToPlainText(
        '<p>Aspire&nbsp;&amp; <em>C&#35;</em> &#x1F680;</p><p>It&rsquo;s ' +
          '&lt;ready&gt;.<br>Next<!-- invisible --></p><script>ignored()</script>' +
          '<style>hidden{}</style><template>hidden</template>'
      )
    ).toBe('Aspire & C# 🚀 It’s <ready>. Next');
    expect(htmlToPlainText('App<strong>Host</strong>')).toBe('AppHost');
  });

  test('uses the matching featured image and keeps posts without usable images', async () => {
    const fetch = mockFetch(
      page(
        [
          post(1, {
            title: { rendered: 'Aspire &amp; friends' },
            featured_media: 10,
            _embedded: {
              'wp:featuredmedia': [
                { id: 99, media_type: 'image', source_url: 'https://example.com/wrong.jpg' },
                { id: 10, media_type: 'image', source_url: 'https://example.com/featured.webp' },
              ],
            },
          }),
          post(2, { excerpt: { rendered: '' } }),
          post(3, { featured_media: 11 }),
          post(4, {
            featured_media: 12,
            _embedded: { 'wp:featuredmedia': [{ code: 'rest_forbidden', data: { status: 403 } }] },
          }),
          post(5, {
            featured_media: 13,
            _embedded: {
              'wp:featuredmedia': [
                { id: 13, media_type: 'image', source_url: 'javascript:alert(1)' },
              ],
            },
          }),
        ],
        5,
        1
      )
    );
    const posts = await fetchAspireBlogPosts({ fetch });
    expect(posts).toHaveLength(5);
    expect(posts[0].title).toBe('Aspire & friends');
    expect(posts[0].image).toBe('https://example.com/featured.webp');
    expect(posts[1].description).toBe('');
    expect(posts.slice(1).every((entry) => !('image' in entry))).toBe(true);
  });

  test.each([
    ['HTTP failure', () => new Response('Unavailable', { status: 503 }), /HTTP 503/],
    ['short page', () => page([]), /Incomplete blog page 2/],
    ['duplicate ID', () => page([post(1, { link: 'https://example.com/another/' })]), /Duplicate/],
    ['duplicate URL', () => page([post(3, { link: post(1).link })]), /Duplicate/],
    ['changed total', () => page([post(3), post(4)], 4, 2), /pagination changed/],
    ['invalid pages', () => page([post(3)], 3, 3), /Invalid archive totals/],
    ['invalid body', () => page({ message: 'Not posts' }), /Incomplete blog page/],
    [
      'malformed JSON',
      () =>
        new Response('{', {
          headers: {
            'content-type': 'application/json',
            'x-wp-total': '3',
            'x-wp-totalpages': '2',
          },
        }),
      /JSON|Unexpected|property/i,
    ],
    [
      'HTML response',
      () => page([post(3)], 3, 2, { 'content-type': 'text/html' }),
      /did not return JSON/,
    ],
    ['invalid header', () => page([post(3)], 3, 2, { 'x-wp-total': '3x' }), /pagination header/],
    [
      'missing header',
      () =>
        new Response('[]', {
          headers: { 'content-type': 'application/json' },
        }),
      /pagination header/,
    ],
  ])('rejects %s without writing or replacing existing data', async (_label, response, error) => {
    const fetch = mockFetch(page([post(1), post(2)]), response());
    await expect(updateAspireBlogPosts('existing.json', { fetch, perPage: 2 })).rejects.toThrow(
      error
    );
    expect(writeFile).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });

  test.each([
    { id: 0 },
    { title: null },
    { title: { rendered: '<p> </p>' } },
    { excerpt: {} },
    { link: 'javascript:alert(1)' },
    { date: '2026-02-30T00:00:00' },
    { date: 'not a date' },
    { featured_media: -1 },
  ])('rejects malformed metadata: %j', async (overrides) => {
    const fetch = mockFetch(page([post(1, overrides)], 1, 1));
    await expect(fetchAspireBlogPosts({ fetch })).rejects.toThrow(/metadata|title/);
  });

  test('refuses an empty archive rather than erasing the previous snapshot', async () => {
    const fetch = mockFetch(page([], 0, 0));
    await expect(updateAspireBlogPosts('existing.json', { fetch })).rejects.toThrow(/totals/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('propagates network failures without overwriting existing data', async () => {
    const fetch = mockFetch(page([post(1), post(2)]));
    fetch.mockRejectedValueOnce(new Error('Connection reset'));
    await expect(updateAspireBlogPosts('existing.json', { fetch, perPage: 2 })).rejects.toThrow(
      'Connection reset'
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('writes stable JSON and replaces the snapshot only after successful validation', async () => {
    const fetch = mockFetch(page([post(1)], 1, 1));
    const posts = await updateAspireBlogPosts('existing.json', { fetch });
    const stagingPath = `existing.json.${process.pid}.next`;
    expect(writeFile).toHaveBeenCalledExactlyOnceWith(
      stagingPath,
      `${JSON.stringify(posts, null, 2)}\n`,
      'utf8'
    );
    expect(rename).toHaveBeenCalledExactlyOnceWith(stagingPath, 'existing.json');
    expect(rm).toHaveBeenCalledExactlyOnceWith(stagingPath, { force: true });
    expect(vi.mocked(writeFile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rename).mock.invocationCallOrder[0]
    );
  });

  test('cleans up staging output if atomic replacement fails', async () => {
    vi.mocked(rename).mockRejectedValueOnce(new Error('Access denied'));
    const fetch = mockFetch(page([post(1)], 1, 1));
    await expect(updateAspireBlogPosts('existing.json', { fetch })).rejects.toThrow(
      'Access denied'
    );
    expect(rm).toHaveBeenCalledWith(`existing.json.${process.pid}.next`, { force: true });
  });
});
