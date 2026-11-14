// Ported from src/frontend/src/components/ThemeImage.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
export function initThemeImages(): void {
  const html = document.documentElement;

  function updateThemeImages() {
    const theme = html.getAttribute('data-theme') ?? 'light';
    document.querySelectorAll('.theme-image').forEach((img) => {
      if (img instanceof HTMLImageElement) {
        const targetSrc = (theme === 'dark' ? img.dataset.dark : img.dataset.light) || '';
        const targetSrcset =
          (theme === 'dark' ? img.dataset.darkSrcset : img.dataset.lightSrcset) || '';
        if (targetSrc && img.src !== targetSrc) {
          img.src = targetSrc;
        }
        if (img.srcset !== targetSrcset) {
          img.srcset = targetSrcset;
        }
      }
    });
  }

  // Initial set
  updateThemeImages();

  // Watch for theme toggle changes
  const observer = new MutationObserver(updateThemeImages);
  observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
}
