/** DOM equivalent of SearchEmptyState for controllers that render result batches. */
export function createSearchEmptyState(options: {
  title: string;
  query?: string;
  hint: string;
  activeFilters?: string[];
  activeFiltersLabel?: string;
  action?: { label: string; run: () => void };
}): HTMLElement {
  const region = document.createElement('div');
  region.className = 'search-empty';
  const content = document.createElement('div');
  content.className = 'search-empty-content';
  region.append(content);
  const title = document.createElement('p');
  title.className = 'search-empty-title';
  title.textContent = options.title;
  content.append(title);
  if (options.query) {
    const query = document.createElement('p');
    query.className = 'search-empty-query';
    query.textContent = options.query;
    content.append(query);
  }
  const hint = document.createElement('p');
  hint.className = 'search-empty-hint';
  hint.textContent = options.hint;
  content.append(hint);
  setSearchActiveFilters(content, options.activeFilters ?? [], options.activeFiltersLabel);
  if (options.action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-action';
    button.textContent = options.action.label;
    button.addEventListener('click', options.action.run, { once: true });
    content.append(button);
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
    const content = region.querySelector<HTMLElement>('.search-empty-content') ?? region;
    content.insertBefore(list, content.querySelector('.search-action'));
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
