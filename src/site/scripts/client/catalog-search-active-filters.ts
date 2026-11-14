// Ported from src/frontend/src/components/CatalogSearchActiveFilters.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import { setSearchActiveFilters } from '@components/search/search-empty-state';

// Attribute updates bridge synchronous gallery controllers and bundled helpers.
class CatalogSearchActiveFilters extends HTMLElement {
  static observedAttributes = ['data-labels'];

  connectedCallback() {
    this.renderFilters();
  }

  attributeChangedCallback() {
    this.renderFilters();
  }

  private renderFilters() {
    if (!this.isConnected || !this.parentElement) return;
    const labels: string[] = JSON.parse(this.dataset.labels ?? '[]');
    setSearchActiveFilters(this.parentElement, labels, this.dataset.label);
  }
}

if (!customElements.get('catalog-search-active-filters')) {
  customElements.define('catalog-search-active-filters', CatalogSearchActiveFilters);
}
