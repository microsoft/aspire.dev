// Ported from src/frontend/src/components/ThemeImage.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
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
  // The pictures of Douze's image tag ({% image light: ..., dark: ... %}) select their dark sources with
  // prefers-color-scheme: they follow the site's theme instead, which the reader can set apart from the system's.
  document
    .querySelectorAll<HTMLSourceElement>('picture > source[media*="prefers-color-scheme: dark"], picture > source[data-dark-media]')
    .forEach((source) => {
      source.dataset.darkMedia = '';
      const media = theme === 'dark' ? 'all' : 'not all';
      if (source.media !== media) {
        source.media = media;
      }
    });
}

// Initial set
updateThemeImages();

// Watch for theme toggle changes
const observer = new MutationObserver(updateThemeImages);
observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
export {};
