// Ported from src/frontend/src/components/SampleGrid.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// @ts-nocheck: plain JavaScript (was an is:inline script).
// define:vars { messages } becomes the JSON in the data-messages attribute of [data-samples-browser].
(function initializeSampleGrid() {
  const browser = document.querySelector('[data-samples-browser]');
  if (!browser) return;
  if (browser.dataset.samplesInitialized) return;
  browser.dataset.samplesInitialized = 'true';
  const controller = new AbortController();
  const { signal } = controller;
  let messages = {};
  try {
    messages = JSON.parse(browser.getAttribute('data-messages') || '{}');
  } catch {}

  const searchInput = browser.querySelector('[data-search-input]');
  const clearBtn = browser.querySelector('[data-clear-btn]');
  const tagChips = browser.querySelectorAll('[data-tag]');
  const tagFilters = browser.querySelector('[data-tag-filters]');
  const tagToggle = browser.querySelector('[data-tag-toggle]');
  const tagToggleLabel = browser.querySelector('[data-tag-toggle-label]');
  const cardGrid = browser.querySelector('[data-card-grid]');
  const cardItems = browser.querySelectorAll('[data-sample-item]');
  const resultsCount = browser.querySelector('[data-results-count]');
  const clearAllBtn = browser.querySelector('[data-clear-all]');
  const clearFiltersBtn = browser.querySelector('[data-clear-filters]');
  const emptyState = browser.querySelector('[data-empty-state]');
  const resetBtn = browser.querySelector('[data-reset-btn]');

  let activeTags = new Set();
  let searchQuery = '';
  let recoveryAction = 'clearSearch';
  const validTagSlugs = new Set([...tagChips].map((chip) => chip.dataset.tag).filter(Boolean));
  const SEARCH_PARAM = 'q';
  const TAGS_PARAM = 'tags';
  const TAG_COLLAPSE_THRESHOLD = 8;

  // Hydrate `searchQuery` and `activeTags` from the current URL so a shared
  // link like `?q=redis&tags=databases,redis` lands on a pre-filtered view.
  // Unknown tag slugs are silently dropped; whitespace-only `q` is ignored.
  function readFiltersFromUrl() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (_err) {
      return;
    }

    const initialQuery = (params.get(SEARCH_PARAM) || '').trim();
    if (initialQuery) {
      searchQuery = initialQuery;
      searchInput.value = initialQuery;
    }

    const rawTags = params.get(TAGS_PARAM) || '';
    rawTags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag && validTagSlugs.has(tag))
      .forEach((tag) => activeTags.add(tag));

    tagChips.forEach((chip) => {
      const isActive = activeTags.has(chip.dataset.tag);
      chip.classList.toggle('active', isActive);
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  // Mirror current filter state into `location.search` via
  // `history.replaceState` (not `pushState`) so the back/forward stack
  // is unaffected and the URL stays shareable.
  function syncUrl() {
    if (signal.aborted || !browser.isConnected) return;
    let nextSearch = '';
    try {
      const params = new URLSearchParams(window.location.search);
      params.delete(SEARCH_PARAM);
      params.delete(TAGS_PARAM);
      const query = searchQuery.trim();
      if (query) params.set(SEARCH_PARAM, query);
      if (activeTags.size > 0) {
        params.set(TAGS_PARAM, [...activeTags].sort().join(','));
      }
      const serialized = params.toString();
      nextSearch = serialized ? `?${serialized}` : '';
    } catch (_err) {
      return;
    }

    if (window.location.search === nextSearch) return;
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    try {
      window.history.replaceState(window.history.state, '', nextUrl);
    } catch (_err) {
      /* ignore — e.g. sandboxed iframes block history APIs */
    }
  }

  function applyFilters() {
    let visible = 0;
    const query = searchQuery.toLowerCase().trim();

    function matchesItem(item) {
      const card = item.querySelector('.sample-card');
      if (!card) return { matchesSearch: false, matchesTags: false };

      const title = card.dataset.title || '';
      const name = card.dataset.name || '';
      const desc = card.dataset.description || '';
      const tags = (card.dataset.tags || '').split(',').filter(Boolean);

      // Text search
      let matchesSearch = true;
      if (query) {
        matchesSearch =
          title.includes(query) ||
          name.includes(query) ||
          desc.includes(query) ||
          tags.some((t) => t.includes(query));
      }

      // Tag filter (AND logic)
      let matchesTags = true;
      if (activeTags.size > 0) {
        matchesTags = [...activeTags].every((tag) => tags.includes(tag));
      }

      return { matchesSearch, matchesTags };
    }

    cardItems.forEach((item) => {
      const { matchesSearch, matchesTags } = matchesItem(item);
      if (matchesSearch && matchesTags) {
        item.style.display = '';
        visible++;
      } else {
        item.style.display = 'none';
      }
    });

    const total = cardItems.length;
    const hasFilters = activeTags.size > 0;
    resultsCount.textContent = messages.count.replace('{{count}}', String(visible)).replace('{{total}}', String(total));

    cardGrid.style.display = visible === 0 ? 'none' : '';
    emptyState.style.display = visible === 0 ? '' : 'none';
    clearBtn.hidden = !query;
    clearAllBtn.hidden = visible === 0 || !hasFilters || !query;
    clearFiltersBtn.hidden = visible === 0 || !hasFilters || Boolean(query);
    if (visible === 0 && total > 0) {
      let withoutQuery = 0;
      let withoutFilters = 0;
      if (query && activeTags.size > 0) {
        cardItems.forEach((item) => {
          const { matchesSearch, matchesTags } = matchesItem(item);
          if (matchesSearch) withoutFilters++;
          if (matchesTags) withoutQuery++;
        });
      }
      recoveryAction = query && activeTags.size > 0
        ? (withoutFilters > 0 ? 'clearFilters' : withoutQuery > 0 ? 'clearSearch' : 'resetAll')
        : activeTags.size > 0 ? 'clearFilters' : 'clearSearch';
      resetBtn.textContent = messages[recoveryAction];
      const queryText = emptyState.querySelector('.search-empty-query');
      queryText.textContent = messages.query.replace('{{query}}', () => searchQuery.trim());
      queryText.hidden = !query;
      const guidance = recoveryAction === 'clearFilters'
        ? (query ? messages.preserveQueryGuidance : messages.filtersGuidance)
        : recoveryAction === 'clearSearch'
          ? (activeTags.size > 0 ? messages.preserveFiltersGuidance : messages.queryGuidance)
          : messages.resetGuidance;
      const selectedLabels = [...tagChips].filter((chip) => activeTags.has(chip.dataset.tag))
        .map((chip) => chip.dataset.tagLabel);
      emptyState.querySelector('.search-empty-hint').textContent = guidance;
      emptyState.querySelector('catalog-search-active-filters').dataset.labels = JSON.stringify(selectedLabels);
    }

    syncUrl();
  }

  // Search
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    applyFilters();
  }, { signal });

  function clearSearch() {
    searchInput.value = '';
    searchQuery = '';
    applyFilters();
    searchInput.focus();
  }
  clearBtn.addEventListener('click', clearSearch, { signal });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') clearSearch();
  }, { signal });

  // Tag chips
  tagChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
        chip.classList.remove('active');
        chip.setAttribute('aria-pressed', 'false');
      } else {
        activeTags.add(tag);
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
      }
      applyFilters();
    }, { signal });
  });

  // Restore facet defaults without changing the query.
  function clearFilters() {
    activeTags.clear();
    tagChips.forEach((chip) => {
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    });
    applyFilters();
    searchInput.focus();
  }

  function resetAll() {
    searchInput.value = '';
    searchQuery = '';
    clearFilters();
  }

  if (clearAllBtn) clearAllBtn.addEventListener('click', resetAll, { signal });
  clearFiltersBtn.addEventListener('click', clearFilters, { signal });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (recoveryAction === 'resetAll') resetAll();
    else if (recoveryAction === 'clearFilters') clearFilters();
    else clearSearch();
  }, { signal });

  readFiltersFromUrl();
  applyFilters();

  // Mobile "Show all N tags" expander — only meaningful when there are
  // enough tags that the wall would feel overwhelming. The toggle button
  // is hidden on viewports wide enough to show every chip without
  // overflow (see the @media rule in <style>); we still show/hide it via
  // the `hidden` attribute so the count doesn't render when unnecessary.
  if (tagToggle && tagFilters && tagChips.length > TAG_COLLAPSE_THRESHOLD) {
    tagToggle.hidden = false;

    // If a hidden chip is active on hydrate, expand the row by default so
    // the user sees what's filtering their view.
    const visibleHiddenActive = [...tagChips]
      .slice(TAG_COLLAPSE_THRESHOLD)
      .some((chip) => chip.classList.contains('active'));
    if (visibleHiddenActive) {
      tagFilters.setAttribute('data-collapsed', 'false');
      tagToggle.setAttribute('aria-expanded', 'true');
      if (tagToggleLabel) tagToggleLabel.textContent = 'Show fewer tags';
    }

    tagToggle.addEventListener('click', () => {
      const collapsed = tagFilters.getAttribute('data-collapsed') === 'true';
      tagFilters.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      if (tagToggleLabel) {
        tagToggleLabel.textContent = collapsed
          ? 'Show fewer tags'
          : `Show all ${tagChips.length} tags`;
      }
      tagToggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
    }, { signal });
  }
})();
export {};
