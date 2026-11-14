// Ported from src/frontend/node_modules/@astrojs/starlight/components/ThemeSelect.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// StarlightThemeProvider is defined by the inline head script (inline/theme.ts).
declare const StarlightThemeProvider: { updatePickers(theme?: string): void };

type Theme = 'auto' | 'dark' | 'light';

/** Key in `localStorage` to store color theme preference at. */
const storageKey = 'starlight-theme';

/** Get a typesafe theme string from any JS value (unknown values are coerced to `'auto'`). */
const parseTheme = (theme: unknown): Theme =>
  theme === 'auto' || theme === 'dark' || theme === 'light' ? theme : 'auto';

/** Load the user’s preference from `localStorage`. */
const loadTheme = (): Theme =>
  parseTheme(typeof localStorage !== 'undefined' && localStorage.getItem(storageKey));

/** Store the user’s preference in `localStorage`. */
function storeTheme(theme: Theme): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(storageKey, theme === 'light' || theme === 'dark' ? theme : '');
  }
}

/** Get the preferred system color scheme. */
const getPreferredColorScheme = (): Theme =>
  matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

/** Update select menu UI, document theme, and local storage state. */
function onThemeChange(theme: Theme): void {
  StarlightThemeProvider.updatePickers(theme);
  document.documentElement.dataset.theme = theme === 'auto' ? getPreferredColorScheme() : theme;
  storeTheme(theme);
}

// React to changes in system color scheme.
matchMedia(`(prefers-color-scheme: light)`).addEventListener('change', () => {
  if (loadTheme() === 'auto') onThemeChange('auto');
});

class StarlightThemeSelect extends HTMLElement {
  constructor() {
    super();
    onThemeChange(loadTheme());
    this.querySelector('select')?.addEventListener('change', (e) => {
      if (e.currentTarget instanceof HTMLSelectElement) {
        onThemeChange(parseTheme(e.currentTarget.value));
      }
    });
  }
}
if (!customElements.get('starlight-theme-select')) customElements.define('starlight-theme-select', StarlightThemeSelect);
export {};
