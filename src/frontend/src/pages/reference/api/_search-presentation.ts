import { createSearchEmptyState, searchRecoveryAction } from '@components/search/search-empty-state';
import { ApiSearchIndexLoadError } from '@components/api-reference/search-lifecycle';

const LOADING_TEXT = 'Loading search index…';
const LOADING_DELAY_MS = 150;

/**
 * A corrupt or unavailable index is not a valid zero-result response. Downloaded
 * indexes can be retried in place; anything else needs a page reload. A slow
 * download shows a loading message only after a short delay, to avoid flashing.
 */
export function withApiSearchFallback(mount: (root: HTMLElement, signal: AbortSignal) => unknown) {
  return (root: HTMLElement, signal: AbortSignal) => {
    const statusElements = [...root.querySelectorAll<HTMLElement>('[id$="-search-status"], [id$="-search-count"]')];
    const originalText = new Map(statusElements.map(element => [element, element.textContent]));
    const disabled: (HTMLInputElement | HTMLButtonElement)[] = [];

    const showLoading = (attemptSignal: AbortSignal) => {
      const timer = setTimeout(() => {
        root.dataset.apiSearchState = 'loading';
        statusElements.forEach(element => { element.textContent = LOADING_TEXT; });
      }, LOADING_DELAY_MS);
      attemptSignal.addEventListener('abort', () => clearTimeout(timer), { once: true });
      return () => {
        clearTimeout(timer);
        delete root.dataset.apiSearchState;
        statusElements.forEach(element => {
          if (element.textContent === LOADING_TEXT) element.textContent = originalText.get(element) ?? '';
        });
      };
    };

    const retry = (results: HTMLElement) => {
      results.replaceChildren();
      results.style.display = 'none';
      statusElements.forEach(element => { element.textContent = originalText.get(element) ?? ''; });
      disabled.splice(0).forEach(element => { element.disabled = false; });
      start();
    };

    const showUnavailable = (retryable: boolean) => {
      const results = root.querySelector<HTMLElement>('[id$="-search-results"]');
      if (!results) return;
      results.style.display = '';
      results.replaceChildren(createSearchEmptyState({
        title: 'Search unavailable',
        hint: retryable
          ? 'The search index could not be loaded. You can still browse the API reference below.'
          : 'Reload this page to try again. You can still browse the API reference below.',
        action: retryable
          ? { label: 'Try again', run: () => { if (!signal.aborted) retry(results); } }
          : { label: 'Reload page', run: () => { if (!signal.aborted) window.location.reload(); } },
      }));
      statusElements.forEach(element => { element.textContent = 'Search unavailable'; });
      root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.inpage-search input, .inpage-search button')
        .forEach(element => {
          if (results.contains(element)) return;
          element.disabled = true;
          disabled.push(element);
        });
    };

    function start() {
      const controller = new AbortController();
      signal.addEventListener('abort', () => controller.abort(), { once: true });
      const stopLoading = showLoading(controller.signal);
      const fail = (error: unknown) => {
        stopLoading();
        controller.abort();
        if (signal.aborted) return;
        console.error('API search unavailable', error);
        showUnavailable(error instanceof ApiSearchIndexLoadError);
      };
      try {
        const pending = mount(root, controller.signal);
        if (typeof (pending as PromiseLike<unknown> | undefined)?.then === 'function') {
          (pending as PromiseLike<unknown>).then(stopLoading, fail);
        } else stopLoading();
      } catch (error) {
        fail(error);
      }
    }

    start();
  };
}

/** Shared recovery presentation; each API controller still owns matching and facet defaults. */
export class ApiSearchPresentation {
  private reset: HTMLButtonElement | null;
  private clearFilters: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private input: HTMLInputElement,
    private clearQuery: () => void,
    private signal: AbortSignal,
  ) {
    this.reset = root.querySelector('[id$="-reset-all"]');
    this.clearFilters = root.querySelector('[id$="-clear-filters"]')!;
    this.reset?.addEventListener('click', () => this.recover(true, true), { signal });
  }

  update(hasFilters: boolean, hasResults = true): void {
    const hasQuery = !!this.input.value.trim();
    this.clearFilters.style.display = hasResults && hasFilters && !hasQuery ? '' : 'none';
    if (this.reset) this.reset.style.display = hasResults && hasFilters && hasQuery ? '' : 'none';
  }

  renderEmpty(
    container: HTMLElement,
    hasFilters: boolean,
    emptyDataset: boolean,
    counts: { withoutQuery: number; withoutFilters: number },
    kinds: ReadonlySet<string>,
    versions: ReadonlySet<string> | null = null,
  ): void {
    this.update(hasFilters, false);
    const query = this.input.value.trim();
    const hasQuery = !!query;
    const action = searchRecoveryAction(hasQuery, hasFilters, counts);
    const filterLabels = [
      ...[...kinds].map(kind => `Kind: ${kind}`),
      ...(versions !== null
        ? versions.size ? [...versions].map(version => `Version: ${version}`) : ['Versions: none selected']
        : []),
    ];
    const guidance = action === 'Clear filters'
      ? 'Restore the default filters and keep your search text.'
      : action === 'Clear search'
        ? `Clear your search text${hasFilters ? ' and keep the selected filters' : ''}.`
        : 'Neither change alone returns results. Clear your search text and restore the default filters.';
    container.replaceChildren(createSearchEmptyState({
      title: emptyDataset ? 'No API entries available' : 'No matching API entries',
      query: !emptyDataset && hasQuery ? `Search: "${query}"` : undefined,
      hint: emptyDataset
        ? 'This API reference has no searchable entries.'
        : guidance,
      activeFilters: emptyDataset ? [] : filterLabels,
      action: emptyDataset ? undefined : {
        label: action,
        run: () => this.recover(action !== 'Clear filters', action !== 'Clear search'),
      },
    }));
  }

  private recover(query: boolean, filters: boolean): void {
    if (this.signal.aborted) return;
    if (query) this.clearQuery();
    if (filters) this.clearFilters.click();
    this.input.focus();
  }
}
