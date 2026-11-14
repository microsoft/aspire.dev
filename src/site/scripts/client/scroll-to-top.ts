// Ported from src/frontend/src/components/ScrollToTop.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
class ScrollToTop extends HTMLElement {
  private controller?: AbortController;
  private frame?: number;

  connectedCallback() {
    if (this.controller) return;
    // Escape content containers that establish a containing block for fixed controls.
    if (this.parentElement !== document.body) {
      document.body.append(this);
      return;
    }
    this.controller = new AbortController();
    const { signal } = this.controller;
    const button = this.querySelector('button')!;
    const update = () => {
      this.frame = undefined;
      button.classList.toggle(
        'visible',
        window.scrollY > 10 && window.outerWidth / window.innerWidth <= 3
      );
    };
    const schedule = () => {
      this.frame ??= window.requestAnimationFrame(update);
    };
    button.addEventListener(
      'click',
      () => {
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
      },
      { signal }
    );
    window.addEventListener('scroll', schedule, { passive: true, signal });
    window.addEventListener('resize', schedule, { signal });
    schedule();
  }

  disconnectedCallback() {
    this.controller?.abort();
    this.controller = undefined;
    if (this.frame !== undefined) window.cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }
}
if (!customElements.get('aspire-scroll-to-top')) customElements.define('aspire-scroll-to-top', ScrollToTop);
export {};
