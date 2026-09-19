/** DOM equivalent of SearchEmptyState for controllers that render result batches. */
export function createSearchEmptyState(options: {
  title: string;
  hint: string;
  activeFilters?: string[];
  activeFiltersLabel?: string;
  action?: { label: string; run: () => void };
}): HTMLElement {
  const region = document.createElement('div');
  region.className = 'search-empty';
  const title = document.createElement('p');
  title.className = 'search-empty-title';
  title.textContent = options.title;
  const hint = document.createElement('p');
  hint.className = 'search-empty-hint';
  hint.textContent = options.hint;
  region.append(title, hint);
  setSearchActiveFilters(region, options.activeFilters ?? [], options.activeFiltersLabel);
  if (options.action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-action';
    button.textContent = options.action.label;
    button.addEventListener('click', options.action.run, { once: true });
    region.append(button);
  }
  return region;
}

export function setSearchActiveFilters(region: HTMLElement, labels: string[], label = 'Active filters') {
  let list = region.querySelector<HTMLUListElement>('.search-active-filters');
  if (!list && !labels.length) return;
  if (!list) {
    list = document.createElement('ul');
    list.className = 'search-active-filters';
    list.setAttribute('role', 'list');
    region.insertBefore(list, region.querySelector('.search-action'));
  }
  list.setAttribute('aria-label', label);
  list.hidden = labels.length === 0;
  list.replaceChildren(...labels.map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

export function searchRecoveryAction(
  hasQuery: boolean,
  hasFilters: boolean,
  counts: { withoutQuery: number; withoutFilters: number },
) {
  if (hasQuery && hasFilters) {
    if (counts.withoutFilters > 0) return 'Clear filters';
    if (counts.withoutQuery > 0) return 'Clear search';
    return 'Reset all';
  }
  return hasFilters ? 'Clear filters' : 'Clear search';
}
