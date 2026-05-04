/**
 * WebMCP integration: exposes a single `search-aspire-docs` tool to in-page
 * agents via `navigator.modelContext.registerTool()`. The execute callback
 * delegates to a swappable {@link SearchProvider} so the tool surface is
 * stable across search-engine migrations (Pagefind today, Typesense later).
 *
 * Spec: https://webmachinelearning.github.io/webmcp/
 */

import { getSearchProvider, type SearchResponse } from './search';

interface ToolExecuteContext {
  signal?: AbortSignal;
}

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: unknown, ctx?: ToolExecuteContext) => Promise<unknown>;
}

interface ModelContextLike {
  registerTool: (tool: ModelContextTool) => unknown;
}

declare global {
  interface Navigator {
    modelContext?: ModelContextLike;
  }
  interface Window {
    __aspireWebMCPRegistered?: boolean;
  }
}

const TOOL_NAME = 'search-aspire-docs';
const SEARCH_LIMIT_DEFAULT = 10;
const SEARCH_LIMIT_MAX = 25;

const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['query'],
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'A natural-language or keyword query about Aspire.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: SEARCH_LIMIT_MAX,
      default: SEARCH_LIMIT_DEFAULT,
      description: 'Maximum number of results to return.',
    },
  },
} as const;

const description =
  'Search the official Aspire documentation, integration catalog, and CLI reference on aspire.dev. ' +
  'Returns ranked results with title, URL, and a short excerpt.';

function clampLimit(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return SEARCH_LIMIT_DEFAULT;
  }
  return Math.max(1, Math.min(SEARCH_LIMIT_MAX, Math.floor(input)));
}

function asMcpResult(payload: SearchResponse): unknown {
  // MCP/WebMCP tool results conventionally wrap their response in a
  // content array of typed parts. JSON-as-text keeps the result agent-friendly
  // without requiring the host to render structured data.
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: payload.unavailable === true,
  };
}

async function executeSearch(input: unknown): Promise<unknown> {
  const args = (input ?? {}) as { query?: unknown; limit?: unknown };
  const query = typeof args.query === 'string' ? args.query : '';
  const limit = clampLimit(args.limit);

  if (query.trim().length === 0) {
    return asMcpResult({
      results: [],
      unavailable: true,
      reason: '`query` is required and must be a non-empty string.',
    });
  }

  const provider = getSearchProvider();
  try {
    const response = await provider.search(query, limit);
    return asMcpResult(response);
  } catch (error) {
    return asMcpResult({
      results: [],
      unavailable: true,
      reason: error instanceof Error ? error.message : 'Search failed.',
    });
  }
}

function register(): void {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return;
  }
  if (window.__aspireWebMCPRegistered) {
    return;
  }
  const ctx = navigator.modelContext;
  if (!ctx || typeof ctx.registerTool !== 'function') {
    return;
  }

  try {
    ctx.registerTool({
      name: TOOL_NAME,
      description,
      inputSchema,
      execute: executeSearch,
    });
    window.__aspireWebMCPRegistered = true;
  } catch {
    // registerTool throws if a tool with the same name is already registered.
    // That's fine on subsequent view transitions; mark as registered to skip.
    window.__aspireWebMCPRegistered = true;
  }
}

register();
