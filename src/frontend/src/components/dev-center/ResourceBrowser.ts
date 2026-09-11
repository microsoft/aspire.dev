import {
  browsePageItems, facetNames, filterResources, matchesResource, readBrowseState, resourceFacets, resourceMatchRanges,
  RESOURCE_PAGE_SIZE, writeBrowseState, type ResourceSearchEntry,
} from '../../utils/dev-center/resource-search';

const checkboxFacetNames = ['type', 'topic', 'platform', 'language'] as const;

class ResourceBrowser extends HTMLElement {
  private controller?: AbortController;

  connectedCallback() {
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    const form = this.querySelector<HTMLFormElement>('.browse-search')!;
    const input = this.querySelector<HTMLInputElement>('#browse-search-input')!;
    const filters = this.querySelector<HTMLElement>('.browse-filters')!;
    const filterGroups = [...filters.querySelectorAll<HTMLDetailsElement>('[data-filter-group]')];
    const closeFilters = () => { for (const group of filterGroups) group.open = false; };
    const grid = this.querySelector<HTMLUListElement>('.browse-grid')!;
    const cards = [...this.querySelectorAll<HTMLLIElement>('[data-resource-entry]')];
    const entries = cards.map((card) => JSON.parse(card.dataset.resourceEntry!) as ResourceSearchEntry);
    const byId = new Map(cards.map((card, index) => [entries[index].id, card]));
    const available = resourceFacets(entries);
    const checkboxes = [...filters.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const radios = [...filters.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const clearSearch = this.querySelector<HTMLButtonElement>('#browse-search-clear')!;
    const clearFilters = this.querySelector<HTMLButtonElement>('[data-reset-filters]')!;
    const pagination = this.querySelector<HTMLElement>('.browse-pagination')!;
    const pageNumbers = this.querySelector<HTMLElement>('[data-page-numbers]')!;
    const first = this.querySelector<HTMLButtonElement>('[data-page-first]')!;
    const last = this.querySelector<HTMLButtonElement>('[data-page-last]')!;
    const previous = this.querySelector<HTMLButtonElement>('[data-page-previous]')!;
    const next = this.querySelector<HTMLButtonElement>('[data-page-next]')!;
    const empty = this.querySelector<HTMLElement>('.browse-empty')!;
    let state = readBrowseState(new URLSearchParams(location.search), available);
    let pages = 1;
    const highlighted = new Set<HTMLElement>();
    const clearHighlights = () => {
      for (const element of highlighted) element.replaceChildren(element.textContent ?? '');
      highlighted.clear();
    };
    signal.addEventListener('abort', clearHighlights, { once: true });

    const setQuery = () => {
      state.q = input.value;
      state.page = 1;
    };
    const render = () => {
      const matches = filterResources(entries, state);
      pages = Math.max(1, Math.ceil(matches.length / RESOURCE_PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      const start = (state.page - 1) * RESOURCE_PAGE_SIZE;
      const visible = matches.slice(start, start + RESOURCE_PAGE_SIZE);
      const visibleIds = new Set(visible.map((entry) => entry.id));
      for (const [id, card] of byId) card.hidden = !visibleIds.has(id);
      grid.append(...visible.map((entry) => byId.get(entry.id)!));
      clearHighlights();
      if (state.q.trim()) {
        for (const entry of visible) {
          for (const element of byId.get(entry.id)!.querySelectorAll<HTMLElement>('[data-search-highlight]')) {
            const text = element.textContent ?? '';
            const ranges = resourceMatchRanges(text, state.q);
            if (!ranges.length) continue;
            const content: (string | HTMLElement)[] = [];
            let end = 0;
            for (const range of ranges) {
              const mark = document.createElement('mark');
              mark.className = 'browse-search-match';
              mark.textContent = text.slice(range.start, range.end);
              content.push(text.slice(end, range.start), mark);
              end = range.end;
            }
            element.replaceChildren(...content, text.slice(end));
            highlighted.add(element);
          }
        }
      }
      empty.hidden = matches.length > 0;
      const summary = matches.length
        ? `${start + 1}-${start + visible.length} of ${matches.length} resources`
        : '0 resources';
      this.querySelector('[data-results-summary]')!.textContent = summary;
      this.querySelector('#browse-search-status')!.textContent = summary;
      this.querySelector('#browse-search-count')!.textContent = summary;
      clearSearch.style.display = input.value ? 'flex' : 'none';
      clearFilters.hidden = !state.q && !facetNames.some((name) => state[name].length);
      for (const name of checkboxFacetNames) {
        const indicator = this.querySelector<HTMLElement>(`[data-filter-active="${name}"]`);
        if (indicator) indicator.hidden = state[name].length === 0;
        const group = filterGroups.find((group) => group.dataset.filterGroup === name);
        const trigger = group?.querySelector('summary');
        if (group && trigger) {
          const label = group.querySelector('[data-dropdown-label]')!.textContent;
          trigger.setAttribute('aria-label', `${label}${state[name].length ? `, ${state[name].length} selected` : ''}`);
        }
      }
      pagination.hidden = matches.length <= RESOURCE_PAGE_SIZE;
      previous.disabled = state.page === 1;
      next.disabled = state.page === pages;
      first.disabled = previous.disabled;
      last.disabled = next.disabled;
      this.querySelector('[data-page-label]')!.textContent = `Page ${state.page} of ${pages}`;
      pageNumbers.replaceChildren(...browsePageItems(state.page, pages).map((item) => {
        if (item === 'gap') {
          const gap = document.createElement('span');
          gap.className = 'browse-page-gap';
          gap.textContent = '\u2026';
          gap.setAttribute('aria-hidden', 'true');
          return gap;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.page = String(item);
        button.toggleAttribute('data-page-neighbor', Math.abs(item - state.page) <= 1);
        button.textContent = String(item);
        button.setAttribute('aria-label', `Page ${item}`);
        if (item === state.page) button.setAttribute('aria-current', 'page');
        return button;
      }));
      for (const name of checkboxFacetNames) {
        const candidates = entries.filter((entry) => matchesResource(entry, state, name));
        for (const checkbox of checkboxes.filter((checkbox) => checkbox.name === name)) {
          const count = candidates.filter((entry) =>
            name === 'type' ? entry.type === checkbox.value : entry[name].includes(checkbox.value)).length;
          checkbox.checked = state[name].includes(checkbox.value);
          checkbox.disabled = count === 0 && !checkbox.checked;
          this.querySelector(`[data-facet-count="${name}:${checkbox.value}"]`)!.textContent = String(count);
        }
      }
      for (const radio of radios) {
        radio.checked = radio.value === (radio.name === 'sort-date' ? state.sort : radio.name === 'sort-title' ? state.titleSort : state.provider[0] ?? '');
        if (radio.checked) {
          const group = radio.closest<HTMLDetailsElement>('[data-filter-group]')!;
          if (radio.dataset.sortLabel) {
            radio.closest('.browse-sort-row')!.querySelector('[data-sort-selection]')!.textContent = radio.dataset.sortLabel;
          } else {
            const label = radio.value ? radio.closest<HTMLElement>('[data-option-label]')!.dataset.optionLabel! : 'Provider';
            group.querySelector('[data-dropdown-label]')!.textContent = label;
            group.querySelector('summary')!.setAttribute('aria-label', radio.value ? `Provider: ${label}` : 'Provider');
          }
        }
      }
      const dateLabel = this.querySelector('[data-sort-selection="date"]')!.textContent;
      const titleLabel = this.querySelector('[data-sort-selection="title"]')!.textContent;
      this.querySelector('[data-filter-group="sort"] summary')!.setAttribute('aria-label', `Sort by: Date ${dateLabel}, then Title ${titleLabel}`);
    };
    const save = (replace = false) => {
      const url = writeBrowseState(new URL(location.href), state);
      if (url.href === location.href) return;
      if (replace) history.replaceState(null, '', url);
      else history.pushState(null, '', url);
    };
    const restore = () => {
      // History can replace the pager or hide the currently focused control.
      const focused = document.activeElement;
      const hadFocus = focused instanceof HTMLElement && this.contains(focused);
      const focusedFilter = filterGroups.find((group) => group.contains(focused));
      const focusedPagination = pagination.contains(focused);
      closeFilters();
      state = readBrowseState(new URLSearchParams(location.search), available);
      input.value = state.q;
      render();
      // Remove invalid filters and clamp out-of-range pages without adding a history entry.
      save(true);
      if (hadFocus) {
        const target = focusedFilter?.querySelector<HTMLElement>('summary')
          ?? (focusedPagination && !pagination.hidden
            ? pageNumbers.querySelector<HTMLButtonElement>('[aria-current="page"]')
            : null)
          ?? (focused.isConnected && focused.getClientRects().length ? focused : input);
        target.focus({ preventScroll: true });
      }
    };
    const reset = () => {
      state = readBrowseState(new URLSearchParams(), available);
      input.value = '';
      render();
      save();
      input.focus();
    };
    const changePage = (page: number, control: HTMLButtonElement) => {
      if (page === state.page) return;
      const { scrollX } = window;
      const paginationTop = pagination.getBoundingClientRect().top;
      state.page = page;
      render();
      save();
      const focusTarget = control.isConnected && !control.disabled
        ? control
        : pageNumbers.querySelector<HTMLButtonElement>('[aria-current="page"]')!;
      focusTarget.focus({ preventScroll: true });
      window.scrollTo({
        left: scrollX,
        top: window.scrollY + pagination.getBoundingClientRect().top - paginationTop,
        behavior: 'instant',
      });
    };

    form.hidden = false;
    this.querySelector<HTMLElement>('[data-browse-static]')!.hidden = true;
    filters.hidden = false;
    for (const group of filterGroups) {
      group.querySelector('summary')!.addEventListener('click', (event) => {
        event.preventDefault();
        const viewportWidth = document.documentElement.clientWidth;
        group.open = !group.open;
        if (!group.open) return;
        for (const other of filterGroups) if (other !== group) other.open = false;
        group.querySelector('fieldset')!.scrollTop = 0;
        const panel = group.querySelector<HTMLElement>('.browse-filter-panel')!;
        panel.style.left = '0';
        const box = panel.getBoundingClientRect();
        panel.style.left = `${Math.min(0, viewportWidth - 16 - box.right)}px`;
        const optionsTop = group.querySelector('fieldset')!.getBoundingClientRect().top;
        panel.style.setProperty('--browse-options-height', `${Math.max(32, document.documentElement.clientHeight - optionsTop - 24)}px`);
      }, { signal });
    }
    document.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Node) {
        for (const group of filterGroups) if (!group.contains(event.target)) group.open = false;
      }
    }, { signal });
    document.addEventListener('focusin', (event) => {
      if (event.target instanceof Node) {
        for (const group of filterGroups) if (!group.contains(event.target)) group.open = false;
      }
    }, { signal });
    filters.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && event.target instanceof HTMLElement && event.target.matches('summary')) {
        event.preventDefault();
        const group = event.target.closest<HTMLDetailsElement>('[data-filter-group]')!;
        if (!group.open) event.target.click();
        group.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
        return;
      }
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'radio') {
        event.preventDefault();
        closeFilters();
        event.target.closest('[data-filter-group]')!.querySelector('summary')!.focus();
        return;
      }
      if (event.key !== 'Escape') return;
      const openGroup = filterGroups.find((group) => group.open);
      if (!openGroup) return;
      event.preventDefault();
      closeFilters();
      openGroup.querySelector('summary')!.focus();
    }, { signal });
    window.addEventListener('resize', closeFilters, { signal });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      setQuery();
      render();
      save();
    }, { signal });
    input.addEventListener('input', () => {
      setQuery();
      render();
      save(true);
    }, { signal });
    clearSearch.addEventListener('click', () => {
      input.value = '';
      setQuery();
      render();
      save();
      input.focus();
    }, { signal });
    filters.addEventListener('change', (event) => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(control.type)) return;
      for (const name of checkboxFacetNames) {
        state[name] = checkboxes.filter((box) => box.name === name && box.checked).map((box) => box.value);
      }
      if (control.name === 'provider') state.provider = control.value ? [control.value] : [];
      if (control.name === 'sort-date') state.sort = control.value === 'oldest' ? 'oldest' : 'newest';
      if (control.name === 'sort-title') state.titleSort = control.value === 'desc' ? 'desc' : 'asc';
      state.page = 1;
      render();
      save();
    }, { signal });
    for (const control of radios) {
      control.addEventListener('click', (event) => {
        if (event.detail === 0 || control.name.startsWith('sort-')) return;
        closeFilters();
        control.closest('[data-filter-group]')!.querySelector('summary')!.focus();
      }, { signal });
    }
    clearFilters.addEventListener('click', reset, { signal });
    this.querySelector('[data-reset-search]')!.addEventListener('click', reset, { signal });
    previous.addEventListener('click', () => changePage(state.page - 1, previous), { signal });
    next.addEventListener('click', () => changePage(state.page + 1, next), { signal });
    first.addEventListener('click', () => changePage(1, first), { signal });
    last.addEventListener('click', () => changePage(pages, last), { signal });
    pageNumbers.addEventListener('click', (event) => {
      if (event.target instanceof Element) {
        const button = event.target.closest<HTMLButtonElement>('button[data-page]');
        if (button) changePage(Number(button.dataset.page), button);
      }
    }, { signal });
    window.addEventListener('popstate', restore, { signal });
    restore();
    this.setAttribute('data-ready', '');
    this.removeAttribute('data-loading');
    this.removeAttribute('aria-busy');
  }

  disconnectedCallback() {
    this.controller?.abort();
  }
}

if (!customElements.get('resource-browser')) customElements.define('resource-browser', ResourceBrowser);
