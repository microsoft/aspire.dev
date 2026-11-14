// Ported from src/frontend/src/components/starlight/Banner.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// Client controller for the announcement banner. The visibility *decision*
// lives entirely in the imported helper (the same code the unit tests cover),
// so shipped behavior can't diverge from the tests. This bundled module reads
// its per-banner config from `data-*` attributes on the element (a bundled
// script can't use `define:vars`), leaving only DOM/localStorage plumbing here.
// The pre-paint script above applies the same decision before first paint.
import { parseFirstSeen, resolveBannerVisibility } from '@utils/banner-expiry';

const initializeBanner = () => {
  const banner = document.querySelector('[data-aspire-banner]');
  if (!(banner instanceof HTMLElement)) return;

  const { dismissKey, firstSeenKey } = banner.dataset;
  if (!dismissKey || !firstSeenKey) return;

  const expiresOnRaw = banner.dataset.expiresOn;
  const expiresOnMs = expiresOnRaw ? Number(expiresOnRaw) : null;
  const autoDismissRaw = banner.dataset.autoDismissDays;
  const autoDismissAfterDays = autoDismissRaw ? Number(autoDismissRaw) : null;

  let collapseTimeoutId = null;

  const clearPendingCollapse = () => {
    if (collapseTimeoutId !== null) {
      window.clearTimeout(collapseTimeoutId);
      collapseTimeoutId = null;
    }
  };

  const showBanner = () => {
    clearPendingCollapse();
    banner.hidden = false;
    banner.dataset.bannerState = 'open';
  };

  const setCollapsed = (animate) => {
    clearPendingCollapse();

    if (!animate) {
      banner.dataset.bannerState = 'closed';
      banner.hidden = true;
      return;
    }

    banner.dataset.bannerState = 'closing';

    const finishCollapse = () => {
      banner.hidden = true;
      banner.dataset.bannerState = 'closed';
      banner.removeEventListener('transitionend', handleTransitionEnd);
      clearPendingCollapse();
    };

    const handleTransitionEnd = (event) => {
      if (event.target !== banner) return;
      finishCollapse();
    };

    banner.addEventListener('transitionend', handleTransitionEnd);
    collapseTimeoutId = window.setTimeout(finishCollapse, 320);
  };

  let dismissed = false;

  try {
    dismissed = window.localStorage.getItem(dismissKey) === 'true';
  } catch {
    dismissed = false;
  }

  let firstSeenMs = null;

  try {
    firstSeenMs = parseFirstSeen(window.localStorage.getItem(firstSeenKey), Date.now());
  } catch {
    firstSeenMs = null;
  }

  const { visible, persistFirstSeenMs } = resolveBannerVisibility({
    nowMs: Date.now(),
    expiresOnMs: Number.isFinite(expiresOnMs) ? expiresOnMs : null,
    autoDismissAfterDays: Number.isFinite(autoDismissAfterDays) ? autoDismissAfterDays : null,
    firstSeenMs,
    dismissed,
  });

  if (typeof persistFirstSeenMs === 'number') {
    try {
      window.localStorage.setItem(firstSeenKey, String(persistFirstSeenMs));
    } catch {
      // Ignore storage failures (private mode, quota, etc.).
    }
  }

  if (visible) {
    showBanner();
  } else {
    setCollapsed(false);
  }

  if (banner.dataset.dismissInitialized === 'true') return;

  const dismissButton = banner.querySelector('[data-dismiss-banner]');
  if (!(dismissButton instanceof HTMLButtonElement)) return;

  dismissButton.addEventListener('click', () => {
    if (document.activeElement === dismissButton) {
      const main = document.querySelector('main');

      if (main instanceof HTMLElement) {
        main.setAttribute('tabindex', '-1');
        main.focus();
        main.addEventListener(
          'blur',
          () => {
            main.removeAttribute('tabindex');
          },
          { once: true }
        );
      }
    }

    setCollapsed(true);

    try {
      window.localStorage.setItem(dismissKey, 'true');
    } catch {
      // Ignore storage failures (private mode, quota, etc.).
    }
  });

  banner.dataset.dismissInitialized = 'true';
};

initializeBanner();
