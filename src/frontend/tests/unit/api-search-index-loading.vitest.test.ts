import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiSearchIndexLoadError, loadApiSearchIndex } from '@components/api-reference/search-lifecycle';
import { apiSearchIndexUrl } from '@utils/api-search-index';
import { withApiSearchFallback } from '../../src/pages/reference/api/_search-presentation';

interface EmptyState { action: { label: string; run(): void } }

vi.mock('@components/search/search-empty-state', () => ({
  createSearchEmptyState: (options: EmptyState) => options,
  searchRecoveryAction: vi.fn(),
}));

describe('apiSearchIndexUrl', () => {
  it('names the per-surface JSON endpoints', () => {
    expect(apiSearchIndexUrl('', 'typescript')).toBe('/reference/api-search/typescript.json');
    expect(apiSearchIndexUrl('/docs', 'csharp', 'aspire.hosting')).toBe('/docs/reference/api-search/csharp/aspire.hosting.json');
  });
});

describe('loadApiSearchIndex', () => {
  const root = (url?: string, inline?: string) => ({
    dataset: url ? { apiSearchIndexUrl: url } : {},
    querySelector: () => (inline === undefined ? null : { textContent: inline }),
  }) as unknown as HTMLElement;

  afterEach(() => vi.unstubAllGlobals());

  it('downloads the index named by the root', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([{ n: 'a' }]) }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    await expect(loadApiSearchIndex(root('/index.json'), signal)).resolves.toEqual([{ n: 'a' }]);
    expect(fetchMock).toHaveBeenCalledWith('/index.json', expect.objectContaining({ signal }));
  });

  it('reads an embedded index when no URL is present', async () => {
    await expect(loadApiSearchIndex(root(undefined, '[1,2]'), new AbortController().signal)).resolves.toEqual([1, 2]);
  });

  it.each([
    ['a network failure', () => { throw new TypeError('offline'); }],
    ['an HTTP error', () => ({ ok: false, status: 503 })],
    ['invalid JSON', () => ({ ok: true, json: () => Promise.reject(new SyntaxError('bad')) })],
    ['a non-array payload', () => ({ ok: true, json: () => Promise.resolve({}) })],
  ])('reports %s as a retryable load error', async (_, respond) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve().then(respond)));
    await expect(loadApiSearchIndex(root('/index.json'), new AbortController().signal))
      .rejects.toBeInstanceOf(ApiSearchIndexLoadError);
  });

  it('does not wrap failures caused by cancellation', async () => {
    const abort = new AbortController();
    const cancelled = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn(() => { abort.abort(); return Promise.reject(cancelled); }));
    await expect(loadApiSearchIndex(root('/index.json'), abort.signal)).rejects.toBe(cancelled);
  });
});

describe('withApiSearchFallback', () => {
  class Element extends EventTarget {
    textContent: string | null;
    style = { display: 'none' };
    disabled = false;
    dataset: Record<string, string> = {};
    rendered: unknown[] = [];
    constructor(text: string | null = '') {
      super();
      this.textContent = text;
    }
    replaceChildren(...children: unknown[]) { this.rendered = children; }
    contains() { return false; }
  }

  let status: Element;
  let results: Element;
  let input: Element;
  let root: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    status = new Element('31,736 entries');
    results = new Element();
    input = new Element();
    const lists: Record<string, Element[]> = {
      '[id$="-search-status"], [id$="-search-count"]': [status],
      '.inpage-search input, .inpage-search button': [input],
    };
    root = Object.assign(new Element(), {
      querySelectorAll: (selector: string) => lists[selector] ?? [],
      querySelector: (selector: string) => selector === '[id$="-search-results"]' ? results : null,
    }) as unknown as HTMLElement;
    vi.stubGlobal('document', { createElement: () => new Element() });
    vi.stubGlobal('window', { location: { reload: vi.fn() } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows loading text only when the index is slow, then restores the original text', async () => {
    let finish!: () => void;
    withApiSearchFallback(() => new Promise<void>((resolve) => { finish = resolve; }))(root, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(100);
    expect(status.textContent).toBe('31,736 entries');
    await vi.advanceTimersByTimeAsync(100);
    expect(status.textContent).toBe('Loading search index…');
    expect(root.dataset.apiSearchState).toBe('loading');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(status.textContent).toBe('31,736 entries');
    expect(root.dataset.apiSearchState).toBeUndefined();
  });

  it('never flashes loading text for a fast index', async () => {
    withApiSearchFallback(() => Promise.resolve())(root, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(500);
    expect(status.textContent).toBe('31,736 entries');
  });

  it('retries a failed download in place', async () => {
    const mount = vi.fn()
      .mockRejectedValueOnce(new ApiSearchIndexLoadError('offline'))
      .mockResolvedValueOnce(undefined);
    withApiSearchFallback(mount)(root, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(status.textContent).toBe('Search unavailable');
    expect(input.disabled).toBe(true);
    expect(results.rendered).toHaveLength(1);

    const { action } = results.rendered[0] as EmptyState;
    expect(action.label).toBe('Try again');
    action.run();
    await vi.advanceTimersByTimeAsync(0);
    expect(mount).toHaveBeenCalledTimes(2);
    expect(input.disabled).toBe(false);
    expect(status.textContent).toBe('31,736 entries');
  });

  it('asks for a reload when the failure is not a download failure', () => {
    withApiSearchFallback(() => { throw new Error('corrupt'); })(root, new AbortController().signal);
    expect(status.textContent).toBe('Search unavailable');
    expect((results.rendered[0] as EmptyState).action.label).toBe('Reload page');
  });

  it('stays silent when a pending mount fails after navigation', async () => {
    const abort = new AbortController();
    withApiSearchFallback(() => Promise.reject(new ApiSearchIndexLoadError('late')))(root, abort.signal);
    abort.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(status.textContent).toBe('31,736 entries');
    expect(results.rendered).toHaveLength(0);
  });

  it('accepts a mount that returns its controller instead of a promise', () => {
    withApiSearchFallback(() => ({ controller: true }))(root, new AbortController().signal);
    expect(status.textContent).toBe('31,736 entries');
  });
});
