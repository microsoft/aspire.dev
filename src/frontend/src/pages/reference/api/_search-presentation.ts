import { createSearchEmptyState, searchRecoveryAction } from '@components/search/search-empty-state';

/** A corrupt/unavailable embedded index is not a valid zero-result response. */
export function withApiSearchFallback(mount: (root: HTMLElement, signal: AbortSignal) => void) {
  return (root: HTMLElement, signal: AbortSignal) => {
    const controller = new AbortController();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      mount(root, controller.signal);
    } catch (error) {
      controller.abort();
      console.error('API search unavailable', error);
      const results = root.querySelector<HTMLElement>('[id$="-search-results"]');
      if (!results) return;
      results.style.display = '';
      results.replaceChildren(createSearchEmptyState({
        title: 'Search unavailable',
        hint: 'Reload this page to try again. You can still browse the API reference below.',
        action: { label: 'Reload page', run: () => { if (!signal.aborted) window.location.reload(); } },
      }));
      root.querySelectorAll<HTMLElement>('[id$="-search-status"], [id$="-search-count"]')
        .forEach(element => { element.textContent = 'Search unavailable'; });
      root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.inpage-search input, .inpage-search button')
        .forEach(element => { if (!results.contains(element)) element.disabled = true; });
    }
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
