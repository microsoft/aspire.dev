import {
  browsePageItems, facetNames, filterResources, matchesResource, readBrowseState, resourceFacets, resourceMatchRanges,
  RESOURCE_PAGE_SIZE, writeBrowseState, type ResourceSearchEntry,
} from '../../utils/dev-center/resource-search';
import { createFilterHistory } from './filter-history';
import { emptyResultsMessage } from './empty-results';
import { setSearchActiveFilters } from '../search/search-empty-state';

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
    const materializeImage = (card: HTMLLIElement) => {
      for (const source of card.querySelectorAll<HTMLTemplateElement>('template[data-resource-image]')) {
        source.replaceWith(source.content);
      }
    };
    const available = resourceFacets(entries);
    const checkboxes = [...filters.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const radios = [...filters.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const clearSearch = this.querySelector<HTMLButtonElement>('#browse-search-clear')!;
    const clearFilters = this.querySelector<HTMLButtonElement>('[data-reset-filters]')!;
    const resetAll = this.querySelector<HTMLButtonElement>('[data-reset-all]')!;
    const pagination = this.querySelector<HTMLElement>('.browse-pagination')!;
    const pageNumbers = this.querySelector<HTMLElement>('[data-page-numbers]')!;
    const first = this.querySelector<HTMLButtonElement>('[data-page-first]')!;
    const last = this.querySelector<HTMLButtonElement>('[data-page-last]')!;
    const previous = this.querySelector<HTMLButtonElement>('[data-page-previous]')!;
    const next = this.querySelector<HTMLButtonElement>('[data-page-next]')!;
    const empty = this.querySelector<HTMLElement>('.browse-empty')!;
    let recoveryAction: ReturnType<typeof emptyResultsMessage>['action'] = 'Clear search';
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
      const visibleCards = visible.map((entry) => byId.get(entry.id)!);
      for (const card of visibleCards) materializeImage(card);
      grid.append(...visibleCards);
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
      const hasFilters = facetNames.some((name) => state[name].length);
      const hasQuery = Boolean(state.q.trim());
      clearFilters.hidden = !hasFilters || hasQuery || matches.length === 0;
      resetAll.hidden = !hasFilters || !hasQuery || matches.length === 0;
      if (!matches.length && entries.length) {
        const defaultState = readBrowseState(new URLSearchParams(), available);
        const activeFilters = facetNames.flatMap((name) => state[name].map((value) => {
          const option = checkboxes.find((control) => control.name === name && control.value === value)!;
          const label = option.closest<HTMLElement>('[data-option-label]')!.dataset.optionLabel;
          const group = option.closest('[data-filter-group]')!.querySelector('legend')!.textContent;
          return `${group}: ${label}`;
        }));
        const message = emptyResultsMessage('resources', state.q, activeFilters, {
          withoutQuery: entries.filter((entry) => matchesResource(entry, { ...state, q: '' })).length,
          withoutFilters: entries.filter((entry) => matchesResource(entry, { ...defaultState, q: state.q })).length,
        });
        recoveryAction = message.action;
        empty.querySelector('.search-empty-title')!.textContent = message.title;
        const queryText = empty.querySelector<HTMLElement>('.search-empty-query')!;
        queryText.textContent = message.query;
        queryText.hidden = !message.query;
        empty.querySelector('.search-empty-hint')!.textContent = message.hint;
        setSearchActiveFilters(empty, activeFilters);
        empty.querySelector('button')!.textContent = message.action;
      }
      for (const name of facetNames) {
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
      for (const name of facetNames) {
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
        radio.checked = radio.value === (radio.name === 'sort-date' ? state.sort : state.titleSort);
        if (radio.checked) {
          radio.closest('.browse-sort-row')!.querySelector('[data-sort-selection]')!.textContent = radio.dataset.sortLabel!;
        }
      }
      const dateLabel = this.querySelector('[data-sort-selection="date"]')!.textContent;
      const titleLabel = this.querySelector('[data-sort-selection="title"]')!.textContent;
      this.querySelector('[data-filter-group="sort"] summary')!.setAttribute('aria-label', `Sort by: Date ${dateLabel}, then Title ${titleLabel}`);
    };
    const save = (replace = false) => {
      const url = writeBrowseState(new URL(location.href), state);
      return historySync.write(url, replace);
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
      void save(true);
      if (hadFocus) {
        const target = focusedFilter?.querySelector<HTMLElement>('summary')
          ?? (focusedPagination && !pagination.hidden
            ? pageNumbers.querySelector<HTMLButtonElement>('[aria-current="page"]')
            : null)
          ?? (focused.isConnected && focused.getClientRects().length ? focused : input);
        target.focus({ preventScroll: true });
      }
      this.setAttribute('data-ready', '');
      this.removeAttribute('data-loading');
      this.removeAttribute('aria-busy');
    };
    const reset = (filtersOnly = false) => {
      state = {
        ...readBrowseState(new URLSearchParams(), available),
        q: filtersOnly ? state.q : '',
        sort: state.sort,
        titleSort: state.titleSort,
      };
      input.value = state.q;
      render();
      void save();
      input.focus();
    };
    const clearQuery = () => {
      input.value = '';
      setQuery();
      render();
      void save();
      input.focus();
    };
    const changePage = async (page: number, control: HTMLButtonElement) => {
      if (page === state.page) return;
      state.page = page;
      render();
      const navigation = save();
      const focusTarget = control.isConnected && !control.disabled
        ? control
        : pageNumbers.querySelector<HTMLButtonElement>('[aria-current="page"]')!;
      focusTarget.focus({ preventScroll: true });
      await navigation;
      if (signal.aborted || state.page !== page) return;
      this.closest('main')!.querySelector('.breadcrumb')!.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
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
        panel.style.removeProperty('left');
        panel.style.removeProperty('--browse-options-height');
        if (!matchMedia('(max-width: 599px)').matches) {
          panel.style.left = '0';
          const box = panel.getBoundingClientRect();
          panel.style.left = `${Math.min(0, viewportWidth - 16 - box.right)}px`;
          const optionsTop = group.querySelector('fieldset')!.getBoundingClientRect().top;
          panel.style.setProperty('--browse-options-height', `${Math.max(32, document.documentElement.clientHeight - optionsTop - 24)}px`);
        }
      }, { signal });
      for (const dismiss of group.querySelectorAll<HTMLElement>('[data-filter-dismiss]')) {
        dismiss.addEventListener('click', () => {
          group.open = false;
          group.querySelector<HTMLElement>('summary')!.focus({ preventScroll: true });
        }, { signal });
      }
    }
    document.addEventListener('click', (event) => {
      if (event.target instanceof Node) {
        for (const group of filterGroups) if (!group.contains(event.target)) group.open = false;
      }
    }, { signal });
    document.addEventListener('focusin', (event) => {
      if (event.target instanceof Element && event.target.matches('[data-filter-group] summary')) return;
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
      void save();
    }, { signal });
    input.addEventListener('input', () => {
      setQuery();
      render();
      void save(true);
    }, { signal });
    clearSearch.addEventListener('click', clearQuery, { signal });
    filters.addEventListener('change', (event) => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(control.type)) return;
      for (const name of facetNames) {
        state[name] = checkboxes.filter((box) => box.name === name && box.checked).map((box) => box.value);
      }
      if (control.name === 'sort-date') state.sort = control.value === 'oldest' ? 'oldest' : 'newest';
      if (control.name === 'sort-title') state.titleSort = control.value === 'desc' ? 'desc' : 'asc';
      state.page = 1;
      render();
      void save();
    }, { signal });
    clearFilters.addEventListener('click', () => reset(true), { signal });
    resetAll.addEventListener('click', () => reset(), { signal });
    this.querySelector('[data-reset-search]')!.addEventListener('click', () => {
      if (recoveryAction === 'Clear search') clearQuery();
      else reset(recoveryAction === 'Clear filters');
    }, { signal });
    previous.addEventListener('click', () => void changePage(state.page - 1, previous), { signal });
    next.addEventListener('click', () => void changePage(state.page + 1, next), { signal });
    first.addEventListener('click', () => void changePage(1, first), { signal });
    last.addEventListener('click', () => void changePage(pages, last), { signal });
    pageNumbers.addEventListener('click', (event) => {
      if (event.target instanceof Element) {
        const button = event.target.closest<HTMLButtonElement>('button[data-page]');
        if (button) void changePage(Number(button.dataset.page), button);
      }
    }, { signal });
    const historySync = createFilterHistory(this, ['q', ...facetNames, 'provider', 'sort', 'title', 'page'], restore, signal);
    historySync.initialize();
  }

  disconnectedCallback() {
    this.controller?.abort();
  }
}

if (!customElements.get('resource-browser')) customElements.define('resource-browser', ResourceBrowser);
