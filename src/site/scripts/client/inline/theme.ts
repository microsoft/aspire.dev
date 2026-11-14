// Inline (pre-paint) head script: Starlight's ThemeProvider.astro is:inline script (0.41.3), unchanged.
// It sets data-theme on <html> before the first paint and exposes window.StarlightThemeProvider, which
// theme-select.ts and the one-line script after each picker (`StarlightThemeProvider.updatePickers();`)
// use. The picker icons are read from a <template id="theme-icons"> holding one svg per theme with the
// classes light, dark and auto (ThemeProvider.astro renders it).
// @ts-nocheck
window.StarlightThemeProvider = (() => {
  const storedTheme =
    typeof localStorage !== 'undefined' && localStorage.getItem('starlight-theme');
  const theme =
    storedTheme ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  return {
    updatePickers(theme = storedTheme || 'auto') {
      document.querySelectorAll('starlight-theme-select').forEach((picker) => {
        const select = picker.querySelector('select');
        if (select) select.value = theme;
        /** @type {HTMLTemplateElement | null} */
        const tmpl = document.querySelector(`#theme-icons`);
        const newIcon = tmpl && tmpl.content.querySelector('.' + theme);
        if (newIcon) {
          const oldIcon = picker.querySelector('svg.label-icon');
          if (oldIcon) {
            oldIcon.replaceChildren(...newIcon.cloneNode(true).childNodes);
          }
        }
      });
    },
  };
})();
