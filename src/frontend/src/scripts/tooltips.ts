import tippy, { hideAll, type Instance, type Placement, type ReferenceElement } from 'tippy.js';

const tooltips = new Map<ReferenceElement, { instance: Instance; title: string }>();

const MONITOR_INTERVAL_MS = 250;
const TOUCH_AUTO_HIDE_MS = 1500;
const monitors = new WeakMap<Instance, number[]>();
let lastPointerType = '';

function isRendered(element: Element) {
  if (!element.isConnected || element.getClientRects().length === 0) return false;
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    : true;
}

// Touch leaves :hover and focus stuck on the tapped element, and clicks often hide or move the
// reference, so tippy never sees the mouseleave/blur it waits for. Hide those tooltips ourselves.
function startMonitor(instance: Instance) {
  stopMonitor(instance);
  const reference = instance.reference;
  const timers: number[] = [];

  timers.push(
    window.setInterval(() => {
      const engaged =
        reference.matches(':hover, :focus, :focus-within') ||
        (instance.props.interactive && instance.popper.matches(':hover, :focus-within'));
      if (!isRendered(reference) || !engaged) instance.hide();
    }, MONITOR_INTERVAL_MS)
  );

  if (lastPointerType === 'touch' || lastPointerType === 'pen') {
    timers.push(window.setTimeout(() => instance.hide(), TOUCH_AUTO_HIDE_MS));
  }

  monitors.set(instance, timers);
}

function stopMonitor(instance: Instance) {
  for (const id of monitors.get(instance) ?? []) {
    clearInterval(id);
    clearTimeout(id);
  }
  monitors.delete(instance);
}

function trackPointer(event: PointerEvent) {
  lastPointerType = event.pointerType;
}

// Mouse hover and keyboard focus don't emit pointerdown, so reset the modality on those too;
// otherwise a tooltip opened by mouse or Tab after a tap would inherit the touch auto-hide.
function trackMouse(event: PointerEvent) {
  if (event.pointerType === 'mouse') lastPointerType = 'mouse';
}

function trackKeyboard() {
  lastPointerType = 'keyboard';
}

function hideAllTooltips() {
  hideAll({ duration: 0 });
}

function hideTooltipsWhenHidden() {
  if (document.visibilityState === 'hidden') hideAllTooltips();
}

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
      onShown: startMonitor,
      onHidden: stopMonitor,
      onDestroy: stopMonitor,
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
    document.removeEventListener('pointerdown', trackPointer, true);
    document.removeEventListener('pointermove', trackMouse, true);
    document.removeEventListener('keydown', trackKeyboard, true);
    document.removeEventListener('astro:before-preparation', hideAllTooltips);
    document.removeEventListener('visibilitychange', hideTooltipsWhenHidden);
    destroyTooltips();
    delete lifecycleDocument.__aspireTooltipsCleanup;
  };
  lifecycleDocument.__aspireTooltipsCleanup = cleanup;
  document.addEventListener('astro:before-swap', destroyTooltips);
  document.addEventListener('astro:page-load', initializeTooltips);
  document.addEventListener('keydown', dismissTooltip);
  document.addEventListener('pointerdown', trackPointer, { capture: true, passive: true });
  document.addEventListener('pointermove', trackMouse, { capture: true, passive: true });
  document.addEventListener('keydown', trackKeyboard, { capture: true });
  document.addEventListener('astro:before-preparation', hideAllTooltips);
  document.addEventListener('visibilitychange', hideTooltipsWhenHidden);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTooltips, { once: true });
  } else {
    initializeTooltips();
  }

  import.meta.hot?.dispose(cleanup);
}
