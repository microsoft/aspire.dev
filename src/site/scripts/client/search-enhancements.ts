// Ported from src/frontend/src/components/starlight/Search.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
/**
 * Layered enhancements for the Starlight/Pagefind search dialog:
 *   1. Injects the C#/TypeScript "API search notice" template.
 *   2. Injects the keyboard-shortcut footer (↑ ↓ ↵ Esc).
 *   3. Wires keyboard navigation across Pagefind result links so
 *      arrow keys and Tab move *real* focus (and stay in sync).
 *   4. Forwards the typed query into the API notice buttons as `?q=`,
 *      so a user who searches and falls back to the API listings keeps
 *      their query.
 *   5. Aligns clear/search status presentation without replacing Pagefind's
 *      localized loading, result, or failure states.
 *
 * Pagefind UI is rendered lazily (and not at all in `astro dev`), so we
 * use a single MutationObserver on the <site-search> custom element to
 * pick up newly mounted pieces and keep the active result list in sync
 * as the user types. Mutations are coalesced via requestAnimationFrame
 * to avoid flicker while Pagefind re-renders results on every keystroke.
 */
let cleanup: (() => void) | undefined;

function injectTemplate(parent: Element, templateId: string, existingSelector: string): void {
  if (parent.querySelector(existingSelector)) return;
  const tpl = document.getElementById(templateId);
  if (!(tpl instanceof HTMLTemplateElement)) return;
  parent.appendChild(tpl.content.cloneNode(true));
}

class SearchKeyboardNav {
  private dialog: HTMLDialogElement;
  private input: HTMLInputElement | null = null;
  // All keyboard-navigable targets: Pagefind result links + the
  // Pagefind "Load more results" button + the C#/TS API buttons. Up/Down
  // cycle through them in DOM order so arrow nav matches Tab order.
  private targets: HTMLElement[] = [];
  private activeIndex = -1;
  private wired = false;
  private suppressFocusinSync = false;
    // Only a highlight the user moved (arrow keys, Home/End, Tab, focus)
    // survives re-renders; otherwise each render re-highlights the first result.
    private userNavigated = false;
  private readonly keydownHandler: (e: KeyboardEvent) => void;
  private readonly focusinHandler: (e: FocusEvent) => void;
  private readonly dialogStateHandler: () => void;
    private readonly queryInputHandler: () => void;
  private readonly resultsContainerId = 'aspire-search-results';
  private readonly targetSelector =
    '.pagefind-ui__result-link, .pagefind-ui__button, a[data-api-search-link]';

  constructor(dialog: HTMLDialogElement) {
    this.dialog = dialog;
    this.keydownHandler = (e) => this.handleKey(e);
    this.focusinHandler = (e) => this.handleFocusIn(e);
      this.queryInputHandler = () => {
        this.userNavigated = false;
      };
    this.dialogStateHandler = () => {
      this.input?.setAttribute('aria-expanded', this.dialog.open ? 'true' : 'false');
    };
  }

  refresh(): void {
    const input = this.dialog.querySelector<HTMLInputElement>('.pagefind-ui__search-input');
    if (input && !this.wired) {
      this.input = input;
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-controls', this.resultsContainerId);
      // Seed `aria-expanded` so it's always present once the combobox
      // role is set; the line below this `if` will refresh it to the
      // real dialog state on every render.
      input.setAttribute('aria-expanded', 'false');
      // Capture-phase keydown on the dialog catches arrows whether the
      // user is in the input or already on a focused result/button.
      this.dialog.addEventListener('keydown', this.keydownHandler, true);
      this.dialog.addEventListener('focusin', this.focusinHandler);
      this.dialog.addEventListener('close', this.dialogStateHandler);
        input.addEventListener('input', this.queryInputHandler);
      this.wired = true;
    }

    // `aria-expanded` reflects whether the listbox is actually visible.
    // The native <dialog> tracks this via its `open` property.
    this.input?.setAttribute('aria-expanded', this.dialog.open ? 'true' : 'false');

    const resultsContainer = this.dialog.querySelector<HTMLElement>('.pagefind-ui__results');
    if (resultsContainer) {
      // Force the id to the value we advertise via `aria-controls` so the
      // reference is never broken by an upstream id assignment.
      resultsContainer.id = this.resultsContainerId;
      resultsContainer.setAttribute('role', 'listbox');
        // Pagefind wraps each option link in list items and paragraphs. Make
        // those wrappers presentational so the listbox owns its options.
        resultsContainer
          .querySelectorAll('li, p')
          .forEach((el) => el.setAttribute('role', 'none'));
    }

    const newTargets = Array.from(
      this.dialog.querySelectorAll<HTMLElement>(this.targetSelector)
    );

    newTargets.forEach((el, i) => {
      if (!el.id) el.id = `aspire-search-target-${i}`;
      // Only the result links live inside the listbox; the load-more
      // button and API buttons sit outside it, so they stay plain
      // focusable controls (no `role="option"`).
      if (el.classList.contains('pagefind-ui__result-link')) {
        el.setAttribute('role', 'option');
      }
    });

    const sameLength = newTargets.length === this.targets.length;
    const sameNodes = sameLength && newTargets.every((el, i) => el === this.targets[i]);
    if (sameNodes) return;

    // Capture the previously-active *result link* (not button). Buttons
    // are stable across renders so they don't need preservation, and we
    // don't want to auto-park the highlight on them.
      const previousActive = this.activeIndex >= 0 ? this.targets[this.activeIndex] : undefined;
    const previousLink =
        this.userNavigated &&
      this.activeIndex >= 0 &&
      this.targets[this.activeIndex] instanceof HTMLAnchorElement &&
      this.targets[this.activeIndex]?.classList.contains('pagefind-ui__result-link')
        ? (this.targets[this.activeIndex] as HTMLAnchorElement)
        : null;

    // Clean up only the elements that are leaving the target list.
    // Elements that survive into `newTargets` keep their attributes so
    // a transient Pagefind re-render (which can briefly emit a target
    // list without the result links) doesn't permanently wipe the
    // active highlight — `setActive` below will re-establish state on
    // the surviving element if appropriate.
    const newSet = new Set(newTargets);
    for (const stale of this.targets) {
      if (newSet.has(stale)) continue;
      stale.removeAttribute('data-search-active');
      // `aria-selected` is only valid on roles in the listbox family
      // (option/row/tab/gridcell/treeitem). The load-more / API buttons
      // sit outside the listbox, so we never write the attribute on
      // them — and we don't clear it on them either.
      if (stale.getAttribute('role') === 'option') {
        stale.setAttribute('aria-selected', 'false');
      }
    }
    this.targets = newTargets;
      // Re-index the surviving active element so `setActive` clears it rather
      // than whichever new target now occupies its old index.
      this.activeIndex = previousActive ? this.targets.indexOf(previousActive) : -1;

    if (this.targets.length === 0) {
      this.activeIndex = -1;
      this.input?.removeAttribute('aria-activedescendant');
      return;
    }

    // Resolve the first result link in the new list. We only ever
    // auto-highlight result links — never the "Load more results" or
    // C#/TypeScript API buttons. (The buttons stay reachable via Tab
    // and arrow nav once the user explicitly enters the list.)
    const firstResultLinkIndex = this.targets.findIndex(
      (el) =>
        el instanceof HTMLAnchorElement && el.classList.contains('pagefind-ui__result-link')
    );

    let preserved = -1;
    if (previousLink) {
      preserved = this.targets.indexOf(previousLink);
      if (preserved < 0) {
        const prevHref = previousLink.href;
        preserved = this.targets.findIndex(
          (el) =>
            el instanceof HTMLAnchorElement &&
            el.classList.contains('pagefind-ui__result-link') &&
            el.href === prevHref
        );
      }
    }

    if (preserved >= 0) {
      this.setActive(preserved, /* moveFocus */ false, /* scroll */ false);
    } else if (firstResultLinkIndex >= 0) {
      // Auto-highlight the first result (DocSearch / GH command-palette
      // pattern) but keep focus in the input so the user can keep typing.
      this.setActive(firstResultLinkIndex, false, false);
    } else {
      // No results yet (e.g. dialog just opened, only API buttons exist).
      // Leave nav un-anchored so the first ArrowDown lands on the first
      // *real* navigation target the user expects.
      this.activeIndex = -1;
      this.input?.removeAttribute('aria-activedescendant');
    }
  }

  private setActive(index: number, moveFocus = false, scroll = true): void {
    if (this.activeIndex >= 0 && this.targets[this.activeIndex]) {
      const prev = this.targets[this.activeIndex];
      prev.removeAttribute('data-search-active');
      if (prev.getAttribute('role') === 'option') {
        prev.setAttribute('aria-selected', 'false');
      }
    }
    this.activeIndex = index;
    if (index < 0 || !this.targets[index]) {
      this.input?.removeAttribute('aria-activedescendant');
      return;
    }
    const el = this.targets[index];
    el.setAttribute('data-search-active', 'true');
    // `aria-selected` and `aria-activedescendant` are only meaningful
    // when the target lives inside the listbox (role="option"). The
    // load-more button and the API reference buttons are plain
    // focusable controls, so we deliberately leave both attributes
    // off them — otherwise screen readers may announce them as
    // "selected" listbox options.
    if (el.getAttribute('role') === 'option') {
      el.setAttribute('aria-selected', 'true');
      this.input?.setAttribute('aria-activedescendant', el.id);
    } else {
      this.input?.removeAttribute('aria-activedescendant');
    }
      if (moveFocus) this.userNavigated = true;
    if (moveFocus && document.activeElement !== el) {
      this.suppressFocusinSync = true;
      el.focus({ preventScroll: true });
      this.suppressFocusinSync = false;
    }
    if (scroll) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      if (this.targets.length === 0) return;
      e.preventDefault();
      const next = this.activeIndex < 0 ? 0 : (this.activeIndex + 1) % this.targets.length;
      this.setActive(next, /* moveFocus */ true);
    } else if (e.key === 'ArrowUp') {
      if (this.targets.length === 0) return;
      e.preventDefault();
      const prev = this.activeIndex <= 0 ? this.targets.length - 1 : this.activeIndex - 1;
      this.setActive(prev, true);
    } else if (e.key === 'Home' && this.targets.length > 0 && e.target !== this.input) {
      // Home/End are intercepted only when focus has already moved out
      // of the input. While the caret is in the search field, the
      // browser's native cursor behaviour (jump to start/end of the
      // query text) takes priority over list navigation.
      e.preventDefault();
      this.setActive(0, true);
    } else if (e.key === 'End' && this.targets.length > 0 && e.target !== this.input) {
      e.preventDefault();
      this.setActive(this.targets.length - 1, true);
    } else if (e.key === 'Enter' && this.activeIndex >= 0 && this.targets[this.activeIndex]) {
      // If focus is already on the target, the browser's native Enter
      // handles activation. Only synthesise a click when the user is
      // still in the input.
      if (e.target === this.input) {
        e.preventDefault();
        this.targets[this.activeIndex].click();
      }
    }
    // Tab is intentionally NOT intercepted: native browser focus order
    // walks through results + buttons, and `handleFocusIn` keeps
    // activeIndex in sync — so up/down can resume cleanly from wherever
    // Tab landed.
  }

  private handleFocusIn(e: FocusEvent): void {
    if (this.suppressFocusinSync) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const idx = this.targets.indexOf(target);
      if (idx < 0) return;
      // Focusing the auto-highlighted result still counts as navigation, so
      // a later re-render must not move the highlight away from focus.
      this.userNavigated = true;
      if (idx !== this.activeIndex) {
      this.setActive(idx, /* moveFocus */ false, /* scroll */ false);
    }
  }

  destroy(): void {
    this.dialog.removeEventListener('keydown', this.keydownHandler, true);
    this.dialog.removeEventListener('focusin', this.focusinHandler);
    this.dialog.removeEventListener('close', this.dialogStateHandler);
      this.input?.removeEventListener('input', this.queryInputHandler);
  }
}

class ApiSearchLinker {
  private dialog: HTMLDialogElement;
  private input: HTMLInputElement | null = null;
  private buttons: HTMLAnchorElement[] = [];
  private wired = false;
  private readonly inputHandler: () => void;
  private readonly clickHandler: () => void;

  constructor(dialog: HTMLDialogElement) {
    this.dialog = dialog;
    this.inputHandler = () => this.update();
    this.clickHandler = () => this.update();
  }

  refresh(): void {
    if (!this.wired) {
      const input = this.dialog.querySelector<HTMLInputElement>('.pagefind-ui__search-input');
      if (input) {
        this.input = input;
        input.addEventListener('input', this.inputHandler);
        this.wired = true;
      }
    }

    const buttons = Array.from(
      this.dialog.querySelectorAll<HTMLAnchorElement>('a[data-api-search-link]')
    );

    const sameLength = buttons.length === this.buttons.length;
    const sameNodes = sameLength && buttons.every((b, i) => b === this.buttons[i]);
    if (!sameNodes) {
      for (const stale of this.buttons) {
        stale.removeEventListener('mousedown', this.clickHandler);
      }
      this.buttons = buttons;
      for (const btn of this.buttons) {
        // Recompute href on mousedown so middle-click / right-click → "Open in new tab" use the latest query.
        btn.addEventListener('mousedown', this.clickHandler);
      }
    }
    // Pagefind's native clear updates the input without emitting an input event.
    this.update();
  }

  private update(): void {
    const q = (this.input?.value ?? '').trim();
    for (const btn of this.buttons) {
      const baseHref = btn.dataset.apiBaseHref ?? btn.href.split('?')[0];
      btn.href = q ? `${baseHref}?q=${encodeURIComponent(q)}` : baseHref;
    }
  }

  destroy(): void {
    this.input?.removeEventListener('input', this.inputHandler);
    for (const btn of this.buttons) {
      btn.removeEventListener('mousedown', this.clickHandler);
    }
  }
}

function initSearchEnhancements(): void {
  cleanup?.();
  cleanup = undefined;

  const siteSearch = document.querySelector<HTMLElement>('site-search');
  if (!siteSearch) return;

  const dialog = siteSearch.querySelector<HTMLDialogElement>('dialog');
  const dialogFrame = dialog?.querySelector<HTMLElement>('.dialog-frame');
  if (!dialog || !dialogFrame) return;

  const nav = new SearchKeyboardNav(dialog);
  const linker = new ApiSearchLinker(dialog);
  const hubTrigger = document.querySelector<HTMLButtonElement>('[data-open-site-search]');
  const openButton = siteSearch.querySelector<HTMLButtonElement>('button[data-open-modal]')!;
  const openFromHub = (event: MouseEvent) => {
    // Keep the originating click from reaching the dialog's outside-click listener.
    event.stopPropagation();
    openButton.click();
  };
  hubTrigger?.addEventListener('click', openFromHub);

  const setup = () => {
    if (hubTrigger) hubTrigger.disabled = openButton.disabled;
    injectTemplate(dialogFrame, 'api-search-notice-tpl', '.api-search-notice');
    injectTemplate(dialogFrame, 'search-keyboard-footer-tpl', '.search-keyboard-footer');
    nav.refresh();
    linker.refresh();
    const message = dialog.querySelector<HTMLElement>('.pagefind-ui__message');
    message?.setAttribute('role', 'status');
    message?.setAttribute('aria-live', 'polite');
    message?.setAttribute('aria-atomic', 'true');
    const clear = dialog.querySelector<HTMLButtonElement>('.pagefind-ui__search-clear');
    const clearLabel = document.querySelector<HTMLTemplateElement>('#api-search-notice-tpl')?.dataset.clearSearch;
    if (clear && clearLabel && document.documentElement.lang.startsWith('en')) {
      if (clear.getAttribute('aria-label') !== clearLabel) clear.setAttribute('aria-label', clearLabel);
    }
  };
  const focusAfterClear = (event: MouseEvent) => {
    if ((event.target as Element)?.closest('.pagefind-ui__search-clear')) {
      dialog.querySelector<HTMLInputElement>('.pagefind-ui__search-input')?.focus();
    }
  };
  dialog.addEventListener('click', focusAfterClear);

  setup();

  // Pagefind re-renders the result list on every keystroke and emits
  // many mutations per render. Coalesce to one refresh per frame so
  // the active highlight doesn't flicker between intermediate states.
  let rafId: number | null = null;
  const scheduleSetup = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      setup();
    });
  };
  const observer = new MutationObserver(scheduleSetup);
  observer.observe(siteSearch, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  cleanup = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    observer.disconnect();
    hubTrigger?.removeEventListener('click', openFromHub);
    if (hubTrigger) hubTrigger.disabled = true;
    nav.destroy();
    linker.destroy();
    dialog.removeEventListener('click', focusAfterClear);
  };
}

initSearchEnhancements();
export {};
