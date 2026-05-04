import type { SearchProvider, SearchResponse, SearchResult } from './SearchProvider';

interface PagefindHitData {
  url: string;
  meta?: { title?: string };
  excerpt?: string;
}

interface PagefindHit {
  data: () => Promise<PagefindHitData>;
}

interface PagefindModule {
  search: (query: string) => Promise<{ results: PagefindHit[] }>;
}

/**
 * Backs the WebMCP `search-aspire-docs` tool with Starlight's built-in Pagefind
 * index. The index is shipped as a runtime artifact at `/pagefind/pagefind.js`,
 * so we resolve it via dynamic import at first use and cache the module.
 *
 * If Pagefind is absent (skip-search builds, dev mode without a build), the
 * provider returns `{ unavailable: true }` rather than throwing — agents can
 * surface a graceful "search unavailable" state.
 */
export const pagefindProvider: SearchProvider = (() => {
  let modulePromise: Promise<PagefindModule | null> | null = null;

  async function loadModule(): Promise<PagefindModule | null> {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      // /pagefind/pagefind.js is emitted by Starlight at build time.
      // @vite-ignore prevents Vite from trying to resolve this at bundle time.
      const mod = (await import(
        /* @vite-ignore */ `${window.location.origin}/pagefind/pagefind.js`
      )) as PagefindModule;
      return mod;
    } catch {
      return null;
    }
  }

  async function ensureReady(): Promise<void> {
    modulePromise ??= loadModule();
    await modulePromise;
  }

  async function search(query: string, limit: number): Promise<SearchResponse> {
    await ensureReady();
    const mod = await modulePromise;
    if (!mod) {
      return {
        results: [],
        unavailable: true,
        reason: 'Pagefind is not available in this environment.',
      };
    }

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { results: [] };
    }

    const raw = await mod.search(trimmed);
    const top = raw.results.slice(0, Math.max(1, limit));
    const results: SearchResult[] = await Promise.all(
      top.map(async (hit) => {
        const data = await hit.data();
        return {
          title: data.meta?.title ?? data.url,
          url: data.url,
          excerpt: (data.excerpt ?? '').replace(/<[^>]+>/g, '').trim(),
        };
      })
    );
    return { results };
  }

  return {
    id: 'pagefind',
    ensureReady,
    search,
  };
})();
