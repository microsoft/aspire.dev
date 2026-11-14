// Inline script placed right before the sidebar tree, from Starlight's SidebarPersister.astro first
// is:inline script (0.41.3), unchanged: loads the persisted sidebar state and defines <sl-sidebar-restore>
// (one per <details> group, data-index = its running index) which reopens or closes each group as it is
// parsed. Needs <sl-sidebar-state-persist data-hash="..."> around the tree inside #starlight__sidebar.
// @ts-nocheck
(() => {
  try {
    if (!matchMedia('(min-width: 50em)').matches) return;
    /** @type {HTMLElement | null} */
    const target = document.querySelector('sl-sidebar-state-persist');
    const state = JSON.parse(sessionStorage.getItem('sl-sidebar-state') || '0');
    if (!target || !state || target.dataset.hash !== state.hash) return;
    window._starlightScrollRestore = state.scroll;
    customElements.define(
      'sl-sidebar-restore',
      class SidebarRestore extends HTMLElement {
        connectedCallback() {
          try {
            const idx = parseInt(this.dataset.index || '');
            const details = this.closest('details');
            if (details && typeof state.open[idx] === 'boolean') details.open = state.open[idx];
          } catch {}
        }
      }
    );
  } catch {}
})();
