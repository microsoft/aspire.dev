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
