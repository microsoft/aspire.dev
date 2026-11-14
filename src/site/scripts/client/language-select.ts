// Ported from src/frontend/node_modules/@astrojs/starlight/components/LanguageSelect.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
class StarlightLanguageSelect extends HTMLElement {
  constructor() {
    super();
    const select = this.querySelector('select');
    if (select) {
      select.addEventListener('change', (e) => {
        if (e.currentTarget instanceof HTMLSelectElement) {
          window.location.pathname = e.currentTarget.value;
        }
      });
      window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return;
        // If the page was loaded from a cache, the language select selected index might not be
        // in sync with the current page.
        const markupSelectedIndex =
          select.querySelector<HTMLOptionElement>('option[selected]')?.index;
        if (markupSelectedIndex !== select.selectedIndex) {
          select.selectedIndex = markupSelectedIndex ?? 0;
        }
      });
    }
  }
}
if (!customElements.get('starlight-lang-select')) customElements.define('starlight-lang-select', StarlightLanguageSelect);
export {};
