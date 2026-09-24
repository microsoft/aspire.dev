import { getStoredPreference, setStoredPreference } from '@utils/browser-storage';

const headingSelector = 'main h1, main h2, main h3, main h4, main h5, main h6';

function findScrollAnchor() {
  let nearest: HTMLElement | undefined;
  let minDistance = Infinity;
  for (const heading of document.querySelectorAll<HTMLElement>(headingSelector)) {
    if (heading.offsetParent === null) continue;
    const distance = -heading.getBoundingClientRect().top;
    if (distance >= -100 && distance < minDistance) {
      minDistance = distance;
      nearest = heading;
    }
  }
  return nearest
    ? { id: nearest.id, text: nearest.textContent, offset: nearest.getBoundingClientRect().top }
    : undefined;
}

function restoreScrollAnchor(anchor: ReturnType<typeof findScrollAnchor>) {
  if (!anchor) return;
  let heading = document.getElementById(anchor.id);
  if (!heading || heading.offsetParent === null) {
    heading =
      [...document.querySelectorAll<HTMLElement>(headingSelector)].find(
        (candidate) => candidate.offsetParent !== null && candidate.textContent === anchor.text
      ) ?? null;
  }
  if (heading) {
    window.scrollTo({
      top: window.scrollY + heading.getBoundingClientRect().top - anchor.offset,
      behavior: 'instant',
    });
  }
}

export class PivotSelector extends HTMLElement {
  private controller?: AbortController;

  connectedCallback() {
    if (this.controller) return;
    this.controller = new AbortController();
    const { signal } = this.controller;
    let initialized = false;
    const initialize = () => {
      if (initialized) return;
      initialized = true;
      this.initialize(signal);
    };
    // A swapped element connects before Astro updates the URL and restores scroll.
    document.addEventListener('astro:page-load', initialize, {
      once: true,
      signal,
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize, {
        once: true,
        signal,
      });
    }
    document.addEventListener('astro:before-swap', () => this.dispose(), {
      once: true,
      signal,
    });
  }

  disconnectedCallback() {
    this.dispose();
  }

  private dispose() {
    this.controller?.abort();
    this.controller = undefined;
  }

  private initialize(signal: AbortSignal) {
    const key = this.dataset.pivotKey;
    const selector = this.querySelector<HTMLElement>('.pivot-selector');
    if (!key || !selector) throw new Error('Pivot selector requires a key and option container.');
    const buttons = [...selector.querySelectorAll<HTMLButtonElement>('button[data-pivot-option]')];
    const validOptions = buttons
      .filter((button) => !button.disabled)
      .map((button) => button.dataset.pivotOption);
    const allOptions = buttons.map((button) => button.dataset.pivotOption);
    const collapseButton = this.querySelector<HTMLButtonElement>('.pivot-collapse-btn');
    const expandButton = this.querySelector<HTMLButtonElement>('.pivot-expand-btn');
    let placeholder: HTMLDivElement | undefined;
    let floatingFrame: number | undefined;
    let restoreFrame: number | undefined;
    let resizeTimer: number | undefined;
    let autoCollapseTimer: number | undefined;
    let scrollTimer: number | undefined;
    let originalTop = 0;
    let isFloating = false;
    let isCollapsed = false;
    let userExpanded = false;
    let enableScrollCollapse = false;
    let lastScrollTop = window.scrollY;

    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(resizeTimer);
        window.clearTimeout(autoCollapseTimer);
        window.clearTimeout(scrollTimer);
        if (floatingFrame !== undefined) window.cancelAnimationFrame(floatingFrame);
        if (restoreFrame !== undefined) window.cancelAnimationFrame(restoreFrame);
        placeholder?.remove();
        this.classList.remove('floating', 'collapsed');
        delete selector.dataset.pivotInitialized;
      },
      { once: true }
    );

    const apply = (id: string, preserveScroll: boolean) => {
      const anchor = preserveScroll ? findScrollAnchor() : undefined;
      setStoredPreference(key, id);
      // Keep destination Starlight tabs on the same AppHost language.
      if (key === 'aspire-lang' && (id === 'csharp' || id === 'typescript')) {
        setStoredPreference(
          'starlight-synced-tabs__aspire-lang',
          id === 'csharp' ? 'C#' : 'TypeScript'
        );
        document.documentElement.dataset.apphostLang = id;
      }
      const url = new URL(window.location.href);
      url.searchParams.set(key, id);
      window.history.replaceState(window.history.state, '', url);

      for (const root of document.querySelectorAll<HTMLElement>('aspire-pivot-selector')) {
        if (root.dataset.pivotKey !== key) continue;
        for (const button of root.querySelectorAll<HTMLButtonElement>(
          'button[data-pivot-option]'
        )) {
          button.classList.toggle('active', button.dataset.pivotOption === id);
        }
      }
      for (const block of document.querySelectorAll<HTMLElement>('[data-pivot-block]')) {
        const ids = (block.dataset.pivotBlock ?? '').split(/[,;]/).map((value) => value.trim());
        // Selectors with different option sets must not hide each other's content.
        if (ids.some((value) => allOptions.includes(value))) {
          block.style.display = ids.includes(id) ? '' : 'none';
        }
      }
      if (restoreFrame !== undefined) window.cancelAnimationFrame(restoreFrame);
      if (anchor) {
        restoreFrame = window.requestAnimationFrame(() => {
          restoreFrame = undefined;
          restoreScrollAnchor(anchor);
        });
      }
    };

    for (const button of buttons) {
      button.addEventListener(
        'click',
        () => {
          const id = button.dataset.pivotOption;
          if (!button.disabled && id && validOptions.includes(id)) apply(id, true);
        },
        { signal }
      );
    }
    const current = [
      new URLSearchParams(window.location.search).get(key),
      getStoredPreference(key),
      validOptions[0],
    ].find((id) => id && validOptions.includes(id));
    if (current) apply(current, false);

    const clearCollapseTimers = () => {
      window.clearTimeout(autoCollapseTimer);
      window.clearTimeout(scrollTimer);
      autoCollapseTimer = undefined;
      scrollTimer = undefined;
      enableScrollCollapse = false;
    };

    const setCollapsed = (collapsed: boolean, expandedByUser = false) => {
      clearCollapseTimers();
      isCollapsed = collapsed;
      userExpanded = expandedByUser;
      this.classList.toggle('collapsed', collapsed);
      if (expandedByUser) {
        // Expansion remains open for five seconds, then the next scroll can collapse it.
        autoCollapseTimer = window.setTimeout(() => {
          autoCollapseTimer = undefined;
          enableScrollCollapse = isFloating && !isCollapsed;
        }, 5000);
      }
    };

    const updateFloatingState = () => {
      floatingFrame = undefined;
      const rect = this.getBoundingClientRect();
      const scrollTop = window.scrollY;
      if (!isFloating) originalTop = scrollTop + rect.top;
      const shouldFloat = scrollTop > originalTop;
      if (shouldFloat === isFloating) return;
      isFloating = shouldFloat;
      if (isFloating) {
        if (!placeholder) {
          placeholder = document.createElement('div');
          placeholder.className = 'pivot-placeholder';
          placeholder.setAttribute('aria-hidden', 'true');
          this.after(placeholder);
        }
        placeholder.style.height = `${rect.height}px`;
        placeholder.style.marginBottom = getComputedStyle(this).marginBottom;
        placeholder.style.display = 'block';
      } else if (placeholder) {
        placeholder.style.display = 'none';
      }
      this.classList.toggle('floating', isFloating);
      setCollapsed(isFloating);
    };

    const scheduleFloatingUpdate = () => {
      if (floatingFrame === undefined) {
        floatingFrame = window.requestAnimationFrame(updateFloatingState);
      }
    };

    const updateTitles = () => {
      const isDesktop = window.matchMedia('(min-width: 72rem)').matches;
      for (const [button, title] of [
        [collapseButton, 'Collapse selector'],
        [expandButton, 'Show selector'],
      ] as const) {
        if (isDesktop) button?.setAttribute('title', title);
        else button?.removeAttribute('title');
      }
    };

    collapseButton?.addEventListener(
      'click',
      (event) => {
        event.stopPropagation();
        setCollapsed(true);
      },
      { signal }
    );
    expandButton?.addEventListener(
      'click',
      (event) => {
        event.stopPropagation();
        setCollapsed(false, true);
      },
      { signal }
    );

    window.addEventListener(
      'scroll',
      () => {
        scheduleFloatingUpdate();
        const scrollTop = window.scrollY;
        if (
          isFloating &&
          !isCollapsed &&
          userExpanded &&
          enableScrollCollapse &&
          Math.abs(scrollTop - lastScrollTop) > 10
        ) {
          window.clearTimeout(scrollTimer);
          scrollTimer = window.setTimeout(() => {
            scrollTimer = undefined;
            setCollapsed(true);
          }, 150);
        }
        lastScrollTop = scrollTop;
      },
      { passive: true, signal }
    );
    window.addEventListener(
      'resize',
      () => {
        updateTitles();
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          resizeTimer = undefined;
          scheduleFloatingUpdate();
        }, 150);
      },
      { signal }
    );

    updateTitles();
    scheduleFloatingUpdate();
    selector.dataset.pivotInitialized = 'true';
  }
}

customElements.define('aspire-pivot-selector', PivotSelector);
