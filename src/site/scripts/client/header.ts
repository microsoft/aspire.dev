// Ported from src/frontend/src/components/starlight/Header.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import '@components/live-status.ts';

let cleanupHeader: (() => void) | undefined;
function initializeHeaderHeight() {
  cleanupHeader?.();
  const header = document.querySelector<HTMLElement>('header.header');
  if (!header) return;
  const mobile = window.matchMedia('(max-width: 49.999rem)');
  let frame = 0;
  const update = () => {
    frame = 0;
    const root = document.documentElement;
    const compact = window.innerWidth < 50 * Number.parseFloat(getComputedStyle(root).fontSize);
    if (root.hasAttribute('data-mobile-layout') !== compact) root.toggleAttribute('data-mobile-layout', compact);
    if (compact) {
      const height = `${header.getBoundingClientRect().height}px`;
      if (root.style.getPropertyValue('--sl-nav-height') !== height) root.style.setProperty('--sl-nav-height', height);
    } else {
      root.style.removeProperty('--sl-nav-height');
    }
  };
  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(requestUpdate);
  observer.observe(header);
  mobile.addEventListener('change', requestUpdate);
  window.addEventListener('resize', requestUpdate);
  update();
  cleanupHeader = () => {
    observer.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
    mobile.removeEventListener('change', requestUpdate);
    window.removeEventListener('resize', requestUpdate);
    document.documentElement.style.removeProperty('--sl-nav-height');
    document.documentElement.removeAttribute('data-mobile-layout');
  };
}
initializeHeaderHeight();
