type ApiSearchLanguage = 'csharp' | 'typescript';
type ApiSearchPageKind = 'landing' | 'package' | 'module' | 'type' | 'item';

/**
 * Astro keeps page scripts alive across client navigations. Mount a controller
 * only on its own language/page root, and dispose its work before that root leaves.
 */
export function registerApiSearch(
  language: ApiSearchLanguage,
  pageKind: ApiSearchPageKind,
  mount: (root: HTMLElement, signal: AbortSignal) => void,
): () => void {
  const selector = `[data-api-search-language="${language}"][data-api-search-kind="${pageKind}"]`;
  let currentRoot: HTMLElement | null = null;
  let controller: AbortController | null = null;

  const cleanup = () => {
    controller?.abort();
    controller = null;
    currentRoot = null;
  };

  const init = () => {
    const root = document.querySelector<HTMLElement>(selector);
    if (root === currentRoot) return;
    cleanup();
    if (!root) return;
    currentRoot = root;
    controller = new AbortController();
    mount(root, controller.signal);
  };

  document.addEventListener('astro:page-load', init);
  document.addEventListener('astro:before-swap', cleanup);
  init();

  return () => {
    cleanup();
    document.removeEventListener('astro:page-load', init);
    document.removeEventListener('astro:before-swap', cleanup);
  };
}

export function readApiSearchIndex<T>(root: HTMLElement): T[] {
  const indexJson = root.querySelector('[data-api-search-index]')?.textContent;
  if (!indexJson?.trim()) {
    throw new Error('API search: missing or empty search index');
  }
  return JSON.parse(indexJson) as T[];
}

/** The index could not be downloaded or understood, so trying again may succeed. */
export class ApiSearchIndexLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiSearchIndexLoadError';
  }
}

/**
 * Large indexes are served as a separate JSON file named by `data-api-search-index-url`.
 * Small ones are still embedded in the page and read synchronously.
 */
export async function loadApiSearchIndex<T>(root: HTMLElement, signal: AbortSignal): Promise<T[]> {
  const url = root.dataset.apiSearchIndexUrl;
  if (!url) return readApiSearchIndex<T>(root);

  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiSearchIndexLoadError('API search: the search index could not be downloaded', { cause: error });
  }
  if (!response.ok) {
    throw new ApiSearchIndexLoadError(`API search: the search index request failed (HTTP ${response.status})`);
  }

  let index: unknown;
  try {
    index = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiSearchIndexLoadError('API search: the search index is not valid JSON', { cause: error });
  }
  if (!Array.isArray(index)) {
    throw new ApiSearchIndexLoadError('API search: the search index is not a list');
  }
  return index as T[];
}
