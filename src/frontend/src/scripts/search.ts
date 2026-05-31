/**
 * Search backend for the WebMCP `search-aspire-docs` tool. Delegates to
 * Starlight's built-in Pagefind index, which is emitted at build time at
 * `/pagefind/pagefind.js`. The module is resolved via dynamic import on
 * first use and cached.
 *
 * If Pagefind is absent (skip-search builds, dev mode without a build), the
 * function returns `{ unavailable: true }` rather than throwing — agents can
 * surface a graceful "search unavailable" state.
 */

export interface SearchResult {
  /** Page title or section heading. */
  title: string;
  /** Absolute or root-relative URL on aspire.dev. */
  url: string;
  /** Short snippet that explains why the page matched. */
  excerpt: string;
}

export interface SearchResponse {
  results: SearchResult[];
  /** True when the underlying engine isn't available in this environment. */
  unavailable?: boolean;
  /** Human-readable reason. Surface to agents in error states. */
  reason?: string;
}

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

let modulePromise: Promise<PagefindModule | null> | null = null;

async function loadPagefind(): Promise<PagefindModule | null> {
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

export async function searchAspireDocs(query: string, limit: number): Promise<SearchResponse> {
  modulePromise ??= loadPagefind();
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
