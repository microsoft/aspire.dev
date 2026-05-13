import { pagefindProvider } from './pagefind-provider';
import type { SearchProvider } from './SearchProvider';
import { typesenseProvider } from './typesense-provider';

export type { SearchProvider, SearchResponse, SearchResult } from './SearchProvider';

/**
 * Selects the active search provider based on the build-time
 * `PUBLIC_SEARCH_PROVIDER` env var. Defaults to Pagefind, which is what
 * Starlight ships today. Once the site migrates to Typesense, set
 * `PUBLIC_SEARCH_PROVIDER=typesense` (or change the default below) — the
 * WebMCP tool surface stays stable across the swap.
 */
export function getSearchProvider(): SearchProvider {
  const raw = (import.meta.env.PUBLIC_SEARCH_PROVIDER as string | undefined) ?? 'pagefind';
  const id = raw.toLowerCase();
  switch (id) {
    case 'typesense':
      return typesenseProvider;
    case 'pagefind':
    default:
      return pagefindProvider;
  }
}
