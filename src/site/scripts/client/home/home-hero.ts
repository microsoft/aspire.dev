// Ported from src/frontend/src/components/home/HomeHero.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
export function initHomeHero(): void {
  function initializeHomeHero() {
    const root = document.querySelector<HTMLElement>('[data-home-hero]');
    if (!root || root.dataset.heroInitialized === 'true') return;

    root.dataset.heroInitialized = 'true';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = window.matchMedia('(min-width: 72rem) and (min-height: 48rem)');
    let frame = 0;

    const update = () => {
      frame = 0;
      if (reducedMotion.matches || !desktop.matches) {
        root.style.setProperty('--home-hero-progress', '0');
        return;
      }

      const top = root.getBoundingClientRect().top;
      const headerHeight =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--sl-nav-height')
        ) || 64;
      const progress = Math.min(1, Math.max(0, (headerHeight - top) / 440));
      root.style.setProperty('--home-hero-progress', progress.toFixed(3));
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    reducedMotion.addEventListener('change', requestUpdate);
    desktop.addEventListener('change', requestUpdate);

    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHomeHero, { once: true });
  } else {
    initializeHomeHero();
  }
}
