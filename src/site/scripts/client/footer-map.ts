// Ported from src/frontend/src/components/starlight/Footer.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// @ts-nocheck: plain JavaScript (was an is:inline script).
(() => {
  const DURATION = 340;
  const SCROLL_DURATION = DURATION + 80;
  const EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  const REVEAL_GAP = 24;

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Animates the footer's "Made with love" map <details> open/closed using the
  // Web Animations API, and nudges the scroll position so the map reveals into
  // view on open and doesn't leave the viewport stranded on close.
  class MapDisclosure {
    constructor(el) {
      this.el = el;
      this.summary = el.querySelector('summary');
      this.content = el.querySelector('.footer-map-content');
      this.animation = null;
      this.scrollFrame = null;
      this.isClosing = false;
      this.isExpanding = false;
      this.summary.addEventListener('click', (event) => this.onClick(event));
    }

    onClick(event) {
      event.preventDefault();
      this.cancelScroll();

      if (prefersReducedMotion()) {
        this.el.open = !this.el.open;
        if (this.el.open) {
          this.content.scrollIntoView({ block: 'nearest' });
        }
        return;
      }

      this.el.style.overflow = 'hidden';
      if (this.isClosing || !this.el.open) {
        this.open();
      } else if (this.isExpanding || this.el.open) {
        this.shrink();
      }
    }

    open() {
      this.el.style.height = `${this.el.offsetHeight}px`;
      this.el.open = true;
      window.requestAnimationFrame(() => this.expand());
    }

    expand() {
      this.isExpanding = true;
      const startHeight = this.el.offsetHeight;
      this.el.style.height = 'auto';
      const endHeight = this.el.offsetHeight;
      this.el.style.height = `${startHeight}px`;
      // Force a reflow so the browser commits the start height before animating.
      void this.el.offsetHeight;

      const top = this.el.getBoundingClientRect().top;
      const overflowBelow = top + endHeight - window.innerHeight + REVEAL_GAP;
      if (overflowBelow > 0) {
        this.smoothScrollTo(window.scrollY + overflowBelow, SCROLL_DURATION);
      }
      this.animate(startHeight, endHeight, true);
    }

    shrink() {
      this.isClosing = true;
      const startHeight = this.el.offsetHeight;
      const endHeight = this.summary.offsetHeight;

      const maxScrollAfter =
        document.documentElement.scrollHeight - (startHeight - endHeight) - window.innerHeight;
      const overshoot = window.scrollY - Math.max(0, maxScrollAfter);
      if (overshoot > 0) {
        this.smoothScrollTo(window.scrollY - overshoot, SCROLL_DURATION);
      }
      this.animate(startHeight, endHeight, false);
    }

    animate(from, to, open) {
      if (this.animation) this.animation.cancel();
      this.animation = this.el.animate(
        { height: [`${from}px`, `${to}px`] },
        { duration: DURATION, easing: EASING }
      );
      this.animation.onfinish = () => this.onFinish(open);
      this.animation.oncancel = () => {
        this.isExpanding = false;
        this.isClosing = false;
      };
    }

    onFinish(open) {
      this.el.open = open;
      this.animation = null;
      this.isExpanding = false;
      this.isClosing = false;
      this.el.style.height = '';
      this.el.style.overflow = '';
    }

    cancelScroll() {
      if (this.scrollFrame) {
        window.cancelAnimationFrame(this.scrollFrame);
        this.scrollFrame = null;
      }
    }

    // Drive the scroll with rAF, re-clamping to the live scrollable range on
    // every frame. The document height is changing underneath us as the map
    // animates open/closed, so a native smooth scroll would lock onto a stale,
    // clamped target and stall halfway; this keeps pace with the live range.
    smoothScrollTo(targetY, duration) {
      this.cancelScroll();
      const startY = window.scrollY;
      const distance = targetY - startY;
      if (distance === 0) return;
      const startTime = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        const y = Math.max(0, Math.min(startY + distance * eased, maxY));
        window.scrollTo(0, y);
        this.scrollFrame = t < 1 ? window.requestAnimationFrame(step) : null;
      };
      this.scrollFrame = window.requestAnimationFrame(step);
    }
  }

  const init = () => {
    const el = document.querySelector('.footer-map-disclosure');
    if (!el || el.dataset.animatedDisclosure === 'true') return;
    el.dataset.animatedDisclosure = 'true';
    new MapDisclosure(el);
  };

  init();
})();
export {};
