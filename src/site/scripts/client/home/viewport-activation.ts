interface ViewportActivationOptions {
  once?: boolean;
  tolerance?: number;
  requireComplete?: boolean;
  waitForReveal?: boolean;
  failSafeDelay?: number;
  failSafeRatio?: number;
}

interface ViewportActivationState {
  activated: boolean;
  active: boolean;
  failSafeReady: boolean;
  failSafeTimer: number | null;
}

const refreshEvent = 'aspire:viewport-activation-refresh';

export interface ViewportActivationObserver {
  observe(target: HTMLElement): void;
  unobserve(target: HTMLElement): void;
  refresh(): void;
  disconnect(): void;
}

function getViewportTop(): number {
  const header = document.querySelector<HTMLElement>('header.header');
  if (!header) return 0;

  const bounds = header.getBoundingClientRect();
  return bounds.top <= 0 && bounds.bottom > 0 ? Math.min(bounds.bottom, window.innerHeight) : 0;
}

function hasSettledReveal(target: HTMLElement, tolerance: number): boolean {
  const reveal = target.closest<HTMLElement>('[data-home-reveal]');
  if (!reveal) return true;
  if (!reveal.classList.contains('home-visible')) return false;

  const styles = window.getComputedStyle(reveal);
  if (Number.parseFloat(styles.opacity) < 0.995) return false;
  if (styles.transform === 'none') return true;

  try {
    const transform = new DOMMatrixReadOnly(styles.transform);
    return Math.abs(transform.m41) <= tolerance && Math.abs(transform.m42) <= tolerance;
  } catch {
    return true;
  }
}

export function createViewportActivationObserver(
  callback: (target: HTMLElement, active: boolean) => void,
  {
    once = false,
    tolerance = 2,
    requireComplete = true,
    waitForReveal = true,
    failSafeDelay = 1000,
    failSafeRatio = 0.9,
  }: ViewportActivationOptions = {}
): ViewportActivationObserver {
  const states = new Map<HTMLElement, ViewportActivationState>();
  let frame = 0;
  let disconnected = false;

  const clearFailSafe = (state: ViewportActivationState) => {
    if (state.failSafeTimer !== null) window.clearTimeout(state.failSafeTimer);
    state.failSafeTimer = null;
    state.failSafeReady = false;
  };

  const evaluate = () => {
    frame = 0;
    if (disconnected) return;

    const viewportTop = getViewportTop();
    const viewportBottom = window.innerHeight;
    const availableHeight = Math.max(0, viewportBottom - viewportTop);
    const completed: HTMLElement[] = [];

    states.forEach((state, target) => {
      const bounds = target.getBoundingClientRect();
      const visibleTop = Math.max(bounds.top, viewportTop);
      const visibleBottom = Math.min(bounds.bottom, viewportBottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const maximumVisibleHeight = Math.min(bounds.height, availableHeight);
      const intersects = visibleHeight > tolerance;
      const fullyPresented =
        maximumVisibleHeight > 0 && visibleHeight >= maximumVisibleHeight - tolerance;
      const failSafeEligible =
        maximumVisibleHeight > 0 && visibleHeight / maximumVisibleHeight >= failSafeRatio;
      const presentationReady = !waitForReveal || hasSettledReveal(target, tolerance);

      if (!state.activated) {
        const activationThresholdReached = requireComplete
          ? fullyPresented || (state.failSafeReady && failSafeEligible)
          : intersects;

        if (presentationReady && activationThresholdReached) {
          state.activated = true;
          clearFailSafe(state);
        } else if (requireComplete && failSafeEligible) {
          if (state.failSafeTimer === null && !state.failSafeReady) {
            state.failSafeTimer = window.setTimeout(() => {
              state.failSafeTimer = null;
              state.failSafeReady = true;
              refresh();
            }, failSafeDelay);
          }
        } else {
          clearFailSafe(state);
        }
      }

      const nextActive = state.activated && (once || intersects);
      if (nextActive !== state.active) {
        state.active = nextActive;
        callback(target, nextActive);
      }

      if (once && state.activated) completed.push(target);
    });

    completed.forEach((target) => states.delete(target));
  };

  const refresh = () => {
    if (disconnected || frame) return;
    frame = window.requestAnimationFrame(evaluate);
  };

  const observe = (target: HTMLElement) => {
    if (disconnected || states.has(target)) return;
    states.set(target, {
      activated: false,
      active: false,
      failSafeReady: false,
      failSafeTimer: null,
    });
    refresh();
  };

  const unobserve = (target: HTMLElement) => {
    const state = states.get(target);
    if (state) clearFailSafe(state);
    states.delete(target);
  };

  const disconnect = () => {
    if (disconnected) return;
    disconnected = true;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    states.forEach(clearFailSafe);
    states.clear();
    window.removeEventListener('scroll', handleViewportChange);
    window.removeEventListener('resize', handleViewportChange);
    document.removeEventListener('transitionend', refresh, true);
    document.removeEventListener(refreshEvent, refresh);
  };

  const handleViewportChange = () => {
    states.forEach((state) => {
      if (!state.activated) clearFailSafe(state);
    });
    refresh();
  };

  window.addEventListener('scroll', handleViewportChange, { passive: true });
  window.addEventListener('resize', handleViewportChange, { passive: true });
  document.addEventListener('transitionend', refresh, true);
  document.addEventListener(refreshEvent, refresh);

  return { observe, unobserve, refresh, disconnect };
}
