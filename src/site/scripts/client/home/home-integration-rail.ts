// Ported from src/frontend/src/components/home/HomeIntegrationRail.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import { createViewportActivationObserver } from './viewport-activation';

export function initHomeIntegrationRail(): void {
  function initializeIntegrationRails() {
    document.querySelectorAll('[data-home-integration-rail]').forEach((root) => {
      if (!(root instanceof HTMLElement) || root.dataset.initialized === 'true') return;
      const control = root.querySelector('[data-rail-control]');
      if (!(control instanceof HTMLButtonElement)) return;
      const pauseIcon = control.querySelector('[data-rail-control-pause]');
      const playIcon = control.querySelector('[data-rail-control-play]');
      if (!(pauseIcon instanceof HTMLElement) || !(playIcon instanceof HTMLElement)) return;

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const mobileViewport = window.matchMedia('(max-width: 49.999rem)');
      const laneViewports = Array.from(root.querySelectorAll<HTMLElement>('.rail-viewport'));
      const interactionTimers = new Map<HTMLElement, number>();
      let manuallyPaused = false;
      let isVisible = false;
      let documentVisible = document.visibilityState === 'visible';

      function getMobileScrollLimit(viewport: HTMLElement) {
        const group = viewport.querySelector<HTMLElement>('.rail-group');
        return Math.max(0, (group?.scrollWidth ?? 0) - viewport.clientWidth);
      }

      function stopInteraction(viewport: HTMLElement) {
        const timer = interactionTimers.get(viewport);
        if (timer) window.clearTimeout(timer);
        interactionTimers.delete(viewport);
        viewport.removeAttribute('data-rail-interacting');
      }

      function markInteraction(viewport: HTMLElement) {
        if (!mobileViewport.matches) return;
        const timer = interactionTimers.get(viewport);
        if (timer) window.clearTimeout(timer);
        viewport.setAttribute('data-rail-interacting', '');
        interactionTimers.set(
          viewport,
          window.setTimeout(() => stopInteraction(viewport), 900)
        );
      }

      function syncMobileLanes() {
        for (const viewport of laneViewports) {
          if (!mobileViewport.matches) {
            stopInteraction(viewport);
            viewport.scrollLeft = 0;
            delete viewport.dataset.mobilePositioned;
            continue;
          }

          const limit = getMobileScrollLimit(viewport);
          if (viewport.dataset.mobilePositioned !== 'true') {
            viewport.dataset.mobilePositioned = 'true';
            viewport.scrollLeft = limit / 2;
          } else {
            viewport.scrollLeft = Math.min(Math.max(0, viewport.scrollLeft), limit);
          }
        }
      }

      function update() {
        const paused = manuallyPaused || reducedMotion.matches;
        const label = paused
          ? (control.dataset.labelPlay ?? 'Play integration animation')
          : (control.dataset.labelPause ?? 'Pause integration animation');
        root.classList.toggle('paused', paused);
        root.toggleAttribute('data-rail-motion-active', isVisible && documentVisible && !paused);
        control.hidden = reducedMotion.matches;
        control.setAttribute('aria-pressed', String(paused));
        control.setAttribute('aria-label', label);
        control.setAttribute('title', label);
        pauseIcon.hidden = paused;
        playIcon.hidden = !paused;
        syncMobileLanes();
      }

      const toggle = () => {
        manuallyPaused = !manuallyPaused;
        update();
      };
      const handlePreference = () => update();
      const handleViewport = () => update();
      const handleVisibility = () => {
        documentVisible = document.visibilityState === 'visible';
        update();
      };
      const laneListeners = laneViewports.map((viewport) => {
        const handlePointerDown = () => markInteraction(viewport);
        const handleScroll = () => {
          if (!mobileViewport.matches) return;
          const limit = getMobileScrollLimit(viewport);
          if (viewport.scrollLeft > limit) viewport.scrollLeft = limit;
          if (viewport.scrollLeft < 0) viewport.scrollLeft = 0;
          markInteraction(viewport);
        };

        viewport.addEventListener('pointerdown', handlePointerDown, { passive: true });
        viewport.addEventListener('scroll', handleScroll, { passive: true });

        return { viewport, handlePointerDown, handleScroll };
      });
      const motionObserver = createViewportActivationObserver(
        (_, active) => {
          isVisible = active;
          update();
        },
        { requireComplete: false, waitForReveal: false }
      );
      const resizeObserver =
        'ResizeObserver' in window ? new ResizeObserver(() => syncMobileLanes()) : null;
      control.addEventListener('click', toggle);
      reducedMotion.addEventListener('change', handlePreference);
      mobileViewport.addEventListener('change', handleViewport);
      document.addEventListener('visibilitychange', handleVisibility);
      motionObserver.observe(root);
      resizeObserver?.observe(root);
      root.dataset.initialized = 'true';
      update();
    });
  }

  initializeIntegrationRails();
}
