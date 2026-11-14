// Ported from src/frontend/src/components/IntegrationTotals.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// ENABLE_INTEGRATION_ANIMATION (a build-time env var, off in production) becomes the presence of an element
// with data-integration-animation="true" on the page.
// Extend the Window interface to include animateIntegrationTotals
// @ts-ignore
declare global {
  interface Window {
    animateIntegrationTotals: () => void;
  }
}

function animateCountUp() {
  // Check if user prefers reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const enabledAnimations = document.querySelector('[data-integration-animation="true"]') !== null;
  const counters = document.querySelectorAll('.total-number');

  counters.forEach((counter) => {
    const target = parseInt(counter.getAttribute('data-target') || '0');
    const shouldFormat = counter.getAttribute('data-format') === 'true';

    if (prefersReducedMotion || enabledAnimations === false) {
      // If user prefers reduced motion, update numbers immediately without animation
      if (shouldFormat) {
        counter.textContent = target.toLocaleString();
      } else {
        counter.textContent = target.toString();
      }
      return;
    }

    // Otherwise proceed with animation as before
    const duration = 1000; // Reduced duration for filter updates
    let startTime: number | null = null;
    const currentValue = parseInt((counter.textContent ?? '0').replace(/,/g, '')) || 0;

    const updateCounter = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      // Calculate progress with easeOutQuad easing function for deceleration
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 2); // Ease out quad

      // Animate from current value to target
      const newValue = Math.floor(currentValue + (target - currentValue) * easedProgress);

      if (shouldFormat) {
        counter.textContent = newValue.toLocaleString();
      } else {
        counter.textContent = newValue.toString();
      }

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        // Ensure final number is exact
        if (shouldFormat) {
          counter.textContent = target.toLocaleString();
        } else {
          counter.textContent = target.toString();
        }
      }
    };

    requestAnimationFrame(updateCounter);
  });
}

// Expose function globally so it can be called from Integrations.astro
window.animateIntegrationTotals = animateCountUp;

// Kick off the animation on initial load. Astro hoists this script and the
// one in Integrations.astro independently, and there is no guaranteed order
// between them. Integrations.astro's `filterCards()` (called on load) will
// invoke `window.animateIntegrationTotals` if it's defined — but if its
// script runs first the function isn't registered yet and the totals stay
// at "0" until the user toggles a filter. Calling animateCountUp() here
// guarantees totals animate on first render regardless of script order;
// subsequent calls after filter changes are idempotent (the animation is
// a no-op when the current value already matches `data-target`).
animateCountUp();
export {};
