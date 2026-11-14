// Ported from src/frontend/src/components/Integrations.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// @ts-nocheck: plain JavaScript (was an is:inline script).
// define:vars { showClientIntegrations, messages } become the JSON in the data-integrations-config attribute
// of the element that carries it (the gallery root).
const integrationsConfig = (() => {
  try {
    return JSON.parse(document.querySelector('[data-integrations-config]')?.getAttribute('data-integrations-config') || '{}');
  } catch {
    return {};
  }
})();
const showClientIntegrations = integrationsConfig.showClientIntegrations ?? false;
const messages = integrationsConfig.messages ?? {};
(function initializeIntegrations() {
  const searchBox = document.querySelector('.search-box');
  if (!document.querySelector('.integration-stats') || !searchBox) return;
  if (searchBox.dataset.integrationsInitialized) return;
  searchBox.dataset.integrationsInitialized = 'true';
  const controller = new AbortController();
  const { signal } = controller;
  let filterTimer;
  const clearButton = document.querySelector('.clear-button');
  const officialToggle = document.querySelector('.type-toggle[data-type="official"]');
  const communityToggle = document.querySelector('.type-toggle[data-type="community"]');
  const hostingToggle = document.querySelector('.type-toggle[data-type="hosting"]');
  const clientToggle = document.querySelector('.type-toggle[data-type="client"]');
  const cards = document.querySelectorAll('.card-grid .card');
  const noResults = document.querySelector('.no-results');
  const statsSection = document.querySelector('.integration-stats');
  const count = document.querySelector('[data-integration-count]');
  const clearFiltersButton = document.querySelector('[data-integration-clear-filters]');
  const resetButton = document.querySelector('[data-integration-reset]');
  const recoveryButton = document.querySelector('[data-integration-recover]');
  let recoveryAction = 'clearSearch';

  let activeTags = new Set();
  let showOfficial = true;
  let showCommunity = true;
  let showHosting = true;
  let showClient = true;

  const urlParams = new URLSearchParams(window.location.search);
  const initialSearch = urlParams.get('search') || '';
  const initialOfficial = urlParams.get('official');
  const initialCommunity = urlParams.get('community');
  const initialHosting = urlParams.get('hosting');
  const initialClient = urlParams.get('client');

  if (initialSearch) {
    searchBox.value = initialSearch;
  }

  if (initialOfficial === 'false') {
    showOfficial = false;
    officialToggle.classList.remove('active');
  }

  if (initialCommunity === 'false') {
    showCommunity = false;
    communityToggle.classList.remove('active');
  }

  if (showClientIntegrations) {
    if (initialHosting === 'false') {
      showHosting = false;
      hostingToggle && hostingToggle.classList.remove('active');
    }

    if (initialClient === 'false') {
      showClient = false;
      clientToggle && clientToggle.classList.remove('active');
    }
  }

  function updateClearButton() {
    clearButton.style.display = searchBox.value.length > 0 ? '' : 'none';
    if (searchBox.value.length > 0) {
      clearButton.classList.add('visible');
    } else {
      clearButton.classList.remove('visible');
    }
  }

  function updateURL() {
    if (signal.aborted || !searchBox.isConnected) return;
    const params = new URLSearchParams(window.location.search);
    ['tags', 'search', 'official', 'community', 'hosting', 'client'].forEach((key) => params.delete(key));
    if (activeTags.size > 0) params.set('tags', [...activeTags].join(','));
    if (searchBox.value.trim()) params.set('search', searchBox.value.trim());
    if (!showOfficial) params.set('official', 'false');
    if (!showCommunity) params.set('community', 'false');
    if (showClientIntegrations) {
      if (!showHosting) params.set('hosting', 'false');
      if (!showClient) params.set('client', 'false');
    }
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    history.replaceState(history.state, '', newUrl);
  }

  function clearSearch() {
    clearTimeout(filterTimer);
    searchBox.value = '';
    updateClearButton();
    filterCards();
    searchBox.focus();
  }

  function hasFacets() {
    return activeTags.size > 0 || !showOfficial || !showCommunity ||
      (showClientIntegrations && (!showHosting || !showClient));
  }

  function clearFilters() {
    clearTimeout(filterTimer);
    activeTags.clear();
    showOfficial = showCommunity = showHosting = showClient = true;
    filterCards();
    searchBox.focus();
  }

  function resetAll() {
    searchBox.value = '';
    updateClearButton();
    clearFilters();
  }

  function updateTotals(visibleCards) {
    // Get the IntegrationTotals component
    const totalsComponent = document.querySelector('.integration-totals');
    if (!totalsComponent) return;

    // Extract data from visible cards
    const visibleIntegrations = Array.from(visibleCards).map((card) => ({
      title: card.dataset.title || '',
      downloads: parseInt(card.dataset.downloads || '0'),
      tags: card.dataset.tags ? card.dataset.tags.split(',') : [],
    }));

    // Calculate new stats
    const totalPackages = visibleIntegrations.length;

    // Calculate unique tags from visible integrations
    const uniqueTags = new Set();
    visibleIntegrations.forEach((pkg) => {
      if (pkg.tags) pkg.tags.forEach((tag) => uniqueTags.add(tag));
    });
    const totalTags = uniqueTags.size;

    // Calculate total downloads from visible integrations
    const totalDownloads = visibleIntegrations.reduce((sum, pkg) => sum + (pkg.downloads || 0), 0);

    // Update the data-target attributes for each total card
    const totalCards = totalsComponent.querySelectorAll('.total-card .total-number');
    if (totalCards.length >= 3) {
      // Update packages count
      totalCards[0].setAttribute('data-target', totalPackages);

      // Update tags count
      totalCards[1].setAttribute('data-target', totalTags);

      // Update downloads count
      totalCards[2].setAttribute('data-target', totalDownloads);
    }

    // After updating the data-target attributes, trigger the animation if enabled in config
    if (window.animateIntegrationTotals) {
      window.animateIntegrationTotals();
    }
  }

  function filterCards(updateUrl = true) {
    if (signal.aborted || !searchBox.isConnected) return;
    const searchTerm = searchBox.value.toLowerCase().trim();
    let visibleCount = 0;
    const visibleCards = [];

    // Split search term by spaces to support multiple keywords
    const searchTerms = searchTerm ? searchTerm.split(/\s+/).filter((term) => term.length > 0) : [];

    function matchesCard(card) {
      const cardTags = card.dataset.tags ? card.dataset.tags.split(',') : [];
      const cardTitle = card.dataset.title ? card.dataset.title.toLowerCase() : '';
      const cardDescription = card.dataset.description
        ? card.dataset.description.toLowerCase()
        : '';

      // Match against tags
      const matchesTags = [...activeTags].every((tag) => cardTags.includes(tag));

      // Check if ALL search terms appear in title, tags, or description
      const matchesSearch =
        searchTerms.length === 0 ||
        searchTerms.some(
          (term) =>
            cardTitle.includes(term) ||
            cardDescription.includes(term) ||
            cardTags.some((tag) => tag.toLowerCase().includes(term))
        );

      // Official/Community filter
      const isOfficial = cardTitle.startsWith('aspire.');
      const isCommunity = !isOfficial;
      const matchesSource = (showOfficial || !isOfficial) && (showCommunity || !isCommunity);

      // Type filters: hide cards with hosting/client tags when toggled off
      const isHosting =
        cardTags.includes('hosting') ||
        /\.aspire\.hosting\./i.test(cardTitle) ||
        cardTitle.startsWith('aspire.hosting.');
      const isClient =
        cardTags.includes('client') ||
        (!isHosting && (cardTitle.startsWith('aspire.') || /\.aspire\./i.test(cardTitle)));
      const matchesType = (showHosting || !isHosting) && (showClient || !isClient);

      return { matchesSearch, matchesFilters: matchesTags && matchesSource && matchesType };
    }

    cards.forEach((card) => {
      const { matchesSearch, matchesFilters } = matchesCard(card);
      const visible = matchesSearch && matchesFilters;
      card.style.display = visible ? '' : 'none';

      if (visible) {
        visibleCount++;
        visibleCards.push(card);
      }
    });

    // Show/hide the no results message based on visible count
    noResults.style.display = visibleCount === 0 ? 'block' : 'none';
    const facets = hasFacets();
    clearFiltersButton.hidden = visibleCount === 0 || !facets || Boolean(searchTerm);
    resetButton.hidden = visibleCount === 0 || !facets || !searchTerm;
    if (visibleCount === 0) {
      let withoutQuery = 0;
      let withoutFilters = 0;
      if (searchTerm && facets) {
        cards.forEach((card) => {
          const { matchesSearch, matchesFilters } = matchesCard(card);
          if (matchesSearch) withoutFilters++;
          if (matchesFilters) withoutQuery++;
        });
      }
      recoveryAction = searchTerm && facets
        ? (withoutFilters > 0 ? 'clearFilters' : withoutQuery > 0 ? 'clearSearch' : 'resetAll')
        : facets ? 'clearFilters' : 'clearSearch';
      recoveryButton.textContent = messages[recoveryAction];
      const queryText = noResults.querySelector('.search-empty-query');
      queryText.textContent = messages.query.replace('{{query}}', () => searchBox.value.trim());
      queryText.hidden = !searchTerm;
      const guidance = recoveryAction === 'clearFilters'
        ? (searchTerm ? messages.preserveQueryGuidance : messages.filtersGuidance)
        : recoveryAction === 'clearSearch'
          ? (facets ? messages.preserveFiltersGuidance : messages.queryGuidance)
          : messages.resetGuidance;
      const excluded = [[officialToggle, showOfficial], [communityToggle, showCommunity],
        [hostingToggle, showHosting], [clientToggle, showClient]]
        .filter(([button, selected]) => button && !selected)
        .map(([button]) => button.textContent.trim());
      noResults.querySelector('.search-empty-hint').textContent = guidance;
      noResults.querySelector('catalog-search-active-filters').dataset.labels = JSON.stringify(
        excluded.map((label) => messages.excludedFilter.replace('{{filter}}', () => label)),
      );
    }
    count.textContent = messages.count.replace('{{count}}', String(visibleCount)).replace('{{total}}', String(cards.length));
    [[officialToggle, showOfficial], [communityToggle, showCommunity],
      [hostingToggle, showHosting], [clientToggle, showClient]].forEach(([button, selected]) => {
        button?.classList.toggle('active', selected);
        button?.setAttribute('aria-pressed', String(selected));
      });

    // Show/hide the stats based on visible count
    statsSection.style.display = visibleCount === 0 ? 'none' : 'block';

    // Update totals with visible cards
    if (visibleCount > 0) {
      updateTotals(visibleCards);
    }

    if (updateUrl) updateURL();
  }

  // Debounce helper
  function debounce(fn, delay) {
    return (...args) => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => fn(...args), delay);
    };
  }

  // Replace direct filterCards call with debounced version for input
  const debouncedFilterCards = debounce(() => filterCards(), 500);

  searchBox.addEventListener('input', () => {
    updateClearButton();
    debouncedFilterCards();
  }, { signal });

  clearButton.addEventListener('click', clearSearch, { signal });
  clearFiltersButton.addEventListener('click', clearFilters, { signal });
  resetButton.addEventListener('click', resetAll, { signal });
  recoveryButton.addEventListener('click', () => {
    // Flush a pending query edit before choosing the action shown for this state.
    clearTimeout(filterTimer);
    filterCards(false);
    if (recoveryAction === 'resetAll') resetAll();
    else if (recoveryAction === 'clearFilters') clearFilters();
    else clearSearch();
  }, { signal });

  officialToggle.addEventListener('click', () => {
    showOfficial = !showOfficial;
    officialToggle.classList.toggle('active', showOfficial);
    filterCards();
  }, { signal });

  communityToggle.addEventListener('click', () => {
    showCommunity = !showCommunity;
    communityToggle.classList.toggle('active', showCommunity);
    filterCards();
  }, { signal });

  hostingToggle &&
    hostingToggle.addEventListener('click', () => {
      showHosting = !showHosting;
      hostingToggle.classList.toggle('active', showHosting);
      filterCards();
    }, { signal });

  clientToggle &&
    clientToggle.addEventListener('click', () => {
      showClient = !showClient;
      clientToggle.classList.toggle('active', showClient);
      filterCards();
    }, { signal });

  // Also clear when user presses Escape in the search box
  searchBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearSearch();
    }
  }, { signal });

  window.addEventListener('popstate', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const search = urlParams.get('search') || '';
    const official = urlParams.get('official') !== 'false';
    const community = urlParams.get('community') !== 'false';
    const hosting = urlParams.get('hosting') !== 'false';
    const client = urlParams.get('client') !== 'false';

    searchBox.value = search;
    showOfficial = official;
    showCommunity = community;
    officialToggle.classList.toggle('active', showOfficial);
    communityToggle.classList.toggle('active', showCommunity);
    if (showClientIntegrations) {
      showHosting = hosting;
      showClient = client;
      hostingToggle && hostingToggle.classList.toggle('active', showHosting);
      clientToggle && clientToggle.classList.toggle('active', showClient);
    }
    updateClearButton();
    filterCards(false);
  }, { signal });

  filterCards(false); // Initial render must not create another history entry.
  updateClearButton();
})();
export {};
