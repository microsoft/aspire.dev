import type { SearchProvider } from './SearchProvider';

/**
 * Stub Typesense-backed provider. aspire.dev's site search is migrating from
 * Pagefind to Typesense; this file exists so the swap is a one-line change in
 * `./index.ts` once the Typesense index, public API key, and host are wired
 * up site-wide.
 *
 * Until then the provider responds with `{ unavailable: true }`. It carries
 * NO runtime dependency on the `typesense` SDK — the npm package is added
 * later as part of the Typesense migration, not as part of agent-readiness.
 */
export const typesenseProvider: SearchProvider = {
  id: 'typesense',
  ensureReady() {
    return Promise.resolve();
  },
  search() {
    return Promise.resolve({
      results: [],
      unavailable: true,
      reason:
        'Typesense provider not yet wired. Set PUBLIC_SEARCH_PROVIDER=typesense after migration.',
    });
  },
};
