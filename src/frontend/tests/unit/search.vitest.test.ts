import type { RootContent } from 'hast';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse } from '@scripts/search';

const pagefind = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('https://aspire.dev/pagefind/pagefind.js', () => pagefind);

function textContent(node: RootContent): string {
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map(textContent).join('') : '';
}

describe('WebMCP search excerpts', () => {
  const parse = unified().use(rehypeParse, { fragment: true });
  const createElement = vi.fn((tag: string) => {
    expect(tag).toBe('template');
    // Model detached template content with a real HTML parser, not a tag regex.
    const content = { textContent: '' };
    return {
      content,
      set innerHTML(html: string) {
        content.textContent = parse.parse(html).children.map(textContent).join('');
      },
    };
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: new URL('https://aspire.dev/') });
    vi.stubGlobal('document', { createElement });
    pagefind.search.mockResolvedValue({ results: [] });
  });

  afterEach(() => vi.unstubAllGlobals());

  function hit(excerpt?: string, title?: string) {
    return {
      data: vi.fn().mockResolvedValue({ url: '/get-started/', meta: { title }, excerpt }),
    };
  }

  it.each([
    [' <mark>Aspire <strong>Redis</strong></mark> &amp; cache ', 'Aspire Redis & cache'],
    ['<mark title="a > b">match</mark> &lt;T&gt; &#124; &#92;', 'match <T> | \\'],
    ['before<!-- hidden --><mark>nested <b>match</mark> after', 'beforenested match after'],
    ['x < y and <mark>unfinished', 'x < y and unfinished'],
    ['<script>globalThis.injected = true</script><img src=x onerror="fail()">text',
      'globalThis.injected = truetext'],
    ['&lt;img src=x onerror="fail()"&gt;', '<img src=x onerror="fail()">'],
    [undefined, ''],
  ])('extracts text from the inert HTML excerpt %j', async (excerpt, expected) => {
    pagefind.search.mockResolvedValue({ results: [hit(excerpt, 'Getting started')] });
    const { searchAspireDocs } = await import('@scripts/search');
    expect(await searchAspireDocs('  redis  ', 10)).toEqual({
      results: [{ title: 'Getting started', url: '/get-started/', excerpt: expected }],
    });
    expect(pagefind.search).toHaveBeenCalledWith('redis');
    expect(createElement).toHaveBeenCalledExactlyOnceWith('template');
  });

  it('preserves result limits, title fallback, and empty queries/results', async () => {
    const hits = [hit('one'), hit('two'), hit('three')];
    pagefind.search.mockResolvedValue({ results: hits });
    const { searchAspireDocs } = await import('@scripts/search');
    const response = await searchAspireDocs('redis', 2);
    expect(response.results).toHaveLength(2);
    expect(response.results[0].title).toBe('/get-started/');
    expect(hits[2].data).not.toHaveBeenCalled();
    expect((await searchAspireDocs('redis', 0)).results).toHaveLength(1);
    pagefind.search.mockClear();
    expect(await searchAspireDocs(' \n ', 10)).toEqual({ results: [] });
    expect(pagefind.search).not.toHaveBeenCalled();
    pagefind.search.mockResolvedValue({ results: [] });
    expect(await searchAspireDocs('no matches', 10)).toEqual({ results: [] });
  });

  it('preserves the unavailable response without a browser environment', async () => {
    vi.stubGlobal('window', undefined);
    const { searchAspireDocs } = await import('@scripts/search');
    expect(await searchAspireDocs('redis', 10)).toEqual({
      results: [],
      unavailable: true,
      reason: 'Pagefind is not available in this environment.',
    });
  });

  it('keeps decoded excerpts inside the unchanged WebMCP JSON-text envelope', async () => {
    const registerTool = vi.fn<(tool: {
      execute: (input: unknown) => Promise<unknown>;
    }) => void>();
    vi.stubGlobal('navigator', { modelContext: { registerTool } });
    const excerpt = '<img src=x onerror="fail()"> & "quoted"';
    pagefind.search.mockResolvedValue({
      results: [hit('&lt;img src=x onerror="fail()"&gt; &amp; "quoted"')],
    });
    await import('@scripts/webmcp');
    const response: SearchResponse = {
      results: [{ title: '/get-started/', url: '/get-started/', excerpt }],
    };
    expect(await registerTool.mock.calls[0][0].execute({ query: 'redis' })).toEqual({
      content: [{ type: 'text', text: JSON.stringify(response) }],
      isError: false,
    });
  });
});
