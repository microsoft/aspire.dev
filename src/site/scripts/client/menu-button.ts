// Ported from src/frontend/src/components/starlight/MobileMenuToggle.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
class MobileMenuButton extends HTMLElement {
  private listeners?: AbortController;

  connectedCallback() {
    this.listeners?.abort();
    this.listeners = new AbortController();
    const { signal } = this.listeners;
    const button = this.querySelector('button');
    const nav = this.closest('nav');
    if (!button || !nav) return;
    button.addEventListener(
      'click',
      () => this.setExpanded(this.getAttribute('aria-expanded') !== 'true'),
      { signal }
    );
    nav.addEventListener(
      'click',
      (event) => {
        if (
          !event.defaultPrevented &&
          event.target instanceof Element &&
          event.target.closest('a[href], .mobile-site-links button')
        ) {
          this.setExpanded(false);
        }
      },
      { signal }
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (this.getAttribute('aria-expanded') !== 'true') return;
        if (event.target instanceof Element && event.target.closest('[role="dialog"], dialog'))
          return;
        if (event.key === 'Escape') {
          event.preventDefault();
          const restoreFocus = nav.contains(document.activeElement);
          this.setExpanded(false);
          if (restoreFocus) button.focus();
        } else if (event.key === 'Tab') {
          const header = document.querySelector('header.header');
          const controls = [header, nav]
            .flatMap((root) =>
              Array.from(
                root?.querySelectorAll<HTMLElement>('a[href], button, input, select, summary') ??
                  []
              )
            )
            .filter(
              (element) =>
                element.tabIndex >= 0 &&
                element.checkVisibility() &&
                !element.matches(':disabled') &&
                !element.closest('[inert]')
            );
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first && last) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last && first) {
            event.preventDefault();
            first.focus();
          }
        }
      },
      { signal }
    );
    document.addEventListener(
      'click',
      (event) => {
        if (event.target instanceof Element && event.target.closest('.live-source-menu')) return;
        if (event.target instanceof Node && !nav.contains(event.target)) this.setExpanded(false);
      },
      { signal }
    );
    window.addEventListener(
      'resize',
      () => {
        if (!button.checkVisibility()) this.setExpanded(false);
      },
      { signal }
    );
  }

  disconnectedCallback() {
    this.setExpanded(false);
    this.listeners?.abort();
  }

  private setExpanded(expanded: boolean) {
    this.setAttribute('aria-expanded', String(expanded));
    this.querySelector('button')?.setAttribute('aria-expanded', String(expanded));
    document.body.toggleAttribute('data-mobile-menu-expanded', expanded);
    document
      .querySelectorAll<HTMLElement>('.main-frame, .sl-skip-link')
      .forEach((element) => element.toggleAttribute('inert', expanded));
  }
}
if (!customElements.get('starlight-menu-button'))
  customElements.define('starlight-menu-button', MobileMenuButton);
export {};
