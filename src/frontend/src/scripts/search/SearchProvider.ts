/**
 * Common search interface used by the WebMCP `search-aspire-docs` tool.
 *
 * Concrete providers (Pagefind today, Typesense in the near future) implement
 * this interface so the WebMCP tool itself stays engine-agnostic. The tool
 * never imports a specific provider directly — it goes through
 * `getSearchProvider()` from `./index.ts`.
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

export interface SearchProvider {
  /** Engine identifier (for telemetry / debugging). */
  readonly id: string;
  /** Lazy initialization. Idempotent. */
  ensureReady(): Promise<void>;
  /**
   * Run a query and return ranked results. `limit` is a soft cap; providers
   * may return fewer results when the corpus is small.
   */
  search(query: string, limit: number): Promise<SearchResponse>;
}
