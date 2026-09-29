import tippy, { type Instance, type Placement, type ReferenceElement } from 'tippy.js';

const tooltips = new Map<ReferenceElement, { instance: Instance; title: string }>();

function initializeTooltips() {
  for (const element of document.querySelectorAll<ReferenceElement>('[title]')) {
    const title = element.getAttribute('title');
    if (!title || element._tippy || tooltips.has(element)) continue;

    const placement = element.getAttribute('data-tooltip-placement') as Placement | null;
    const interactive = element.getAttribute('data-tooltip-interactive');
    const instance = tippy(element, {
      content: title,
      allowHTML: element.getAttribute('data-tippy-allowhtml') !== 'false',
      theme: 'default',
      maxWidth: 'none',
      placement: placement ?? 'auto',
      interactive: interactive === 'true',
      delay: [0, 0],
      duration: [0, 0],
      hideOnClick: true,
      animation: 'scale',
      onClickOutside: (instance) => instance.hide(),
    });
    tooltips.set(element, { instance, title });
    element.setAttribute('title', '');
  }
}

function destroyTooltips() {
  for (const [element, { instance, title }] of tooltips) {
    if (!instance.state.isDestroyed) instance.destroy();
    // Persisted nodes need their source title when the next page initializes.
    if (element.getAttribute('title') === '') element.setAttribute('title', title);
  }
  tooltips.clear();
}

function dismissTooltip(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    const activeElement: ReferenceElement | null = document.activeElement;
    activeElement?._tippy?.hide();
  }
}

const lifecycleDocument = document as Document & { __aspireTooltipsCleanup?: () => void };

if (!lifecycleDocument.__aspireTooltipsCleanup) {
  const cleanup = () => {
    document.removeEventListener('astro:before-swap', destroyTooltips);
    document.removeEventListener('astro:page-load', initializeTooltips);
    document.removeEventListener('keydown', dismissTooltip);
    document.removeEventListener('DOMContentLoaded', initializeTooltips);
    destroyTooltips();
    delete lifecycleDocument.__aspireTooltipsCleanup;
  };
  lifecycleDocument.__aspireTooltipsCleanup = cleanup;
  document.addEventListener('astro:before-swap', destroyTooltips);
  document.addEventListener('astro:page-load', initializeTooltips);
  document.addEventListener('keydown', dismissTooltip);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTooltips, { once: true });
  } else {
    initializeTooltips();
  }

  import.meta.hot?.dispose(cleanup);
}
