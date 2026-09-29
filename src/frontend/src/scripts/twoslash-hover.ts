/**
 * Own the two-slash popup lifecycle instead of the plugin's index-based runtime.
 * The plugin renders each popup inside its hover; pair them before moving the
 * popup outside <pre> to avoid overflow clipping. See ec.config.mjs.
 */
const initializedHovers = new WeakSet<HTMLElement>();
let nextPopupId = 0;

function position(popup: HTMLElement, hover: HTMLElement, container: HTMLElement) {
  const hoverRect = hover.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const maxLeft = Math.max(0, containerRect.width - popupRect.width - 8);
  Object.assign(popup.style, {
    position: 'absolute',
    top: `${hoverRect.bottom - containerRect.top + 4}px`,
    left: `${Math.max(0, Math.min(hoverRect.left - containerRect.left, maxLeft))}px`,
    right: 'auto',
    margin: '0',
  });
}

function initializeHovers() {
  for (const hover of document.querySelectorAll<HTMLElement>('.twoslash-hover')) {
    if (initializedHovers.has(hover)) continue;
    const popup = hover.querySelector<HTMLElement>(':scope > .twoslash-popup-container');
    const container = hover.closest<HTMLElement>('.expressive-code');
    if (!popup || !container) continue;
    initializedHovers.add(hover);

    // Keep the popup in the code theme's CSS scope and below the site navigation.
    container.style.position ||= 'relative';
    container.style.isolation = 'isolate';
    container.appendChild(popup);
    popup.style.display = 'none';
    popup.setAttribute('aria-hidden', 'true');
    popup.setAttribute('role', 'tooltip');
    popup.id = `aspire-twoslash-popup-${++nextPopupId}`;
    hover.setAttribute('aria-describedby', popup.id);

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let hoveringPopup = false;

    function show() {
      clearTimeout(hideTimer);
      popup!.style.display = 'block';
      popup!.setAttribute('aria-hidden', 'false');
      position(popup!, hover, container!);
    }

    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (hoveringPopup || hover.matches(':hover, :focus-within')) return;
        popup!.style.display = 'none';
        popup!.setAttribute('aria-hidden', 'true');
      }, 100);
    }

    hover.addEventListener('mouseenter', show);
    hover.addEventListener('mouseleave', scheduleHide);
    hover.addEventListener('focusin', show);
    hover.addEventListener('focusout', scheduleHide);
    popup.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      hoveringPopup = true;
    });
    popup.addEventListener('mouseleave', () => {
      hoveringPopup = false;
      scheduleHide();
    });
  }
}

// A bundled module runs once; ClientRouter replaces the body on every visit.
document.addEventListener('astro:page-load', initializeHovers);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeHovers, { once: true });
} else {
  initializeHovers();
}
