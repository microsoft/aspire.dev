// Ported from src/frontend/src/components/starlight/Sidebar.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
import { onReady } from './lib/ready';
/**
 * Sidebar filter controller shared by API reference and topic sidebars.
 * Filters sidebar entries by matching their label text against user input.
 */
class SidebarFilterController {
  private controller = new AbortController();
  private input: HTMLInputElement | null = null;
  private clearBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private emptyCopyEl: HTMLElement | null = null;
  private emptyActionBtn: HTMLButtonElement | null = null;
  private sidebarContainer: HTMLElement | null = null;
  private debounceTimer: number | null = null;
  private static readonly DEBOUNCE_MS = 200;

  constructor() {
    this.init();
  }

  private init(): void {
    const container = document.querySelector(
      '.topics-sidebar[data-api-ref], .topics-sidebar[data-topic-nav]'
    ) as HTMLElement | null;
    if (!container) return;
    if (container.dataset.filterBound === 'true') return;
    container.dataset.filterBound = 'true';
    const { signal } = this.controller;

    this.input = container.querySelector('#sidebar-filter-input');
    this.clearBtn = container.querySelector('#sidebar-filter-clear');
    this.statusEl = container.querySelector('#sidebar-filter-status');
    this.emptyEl = container.querySelector('#sidebar-filter-empty');
    this.emptyCopyEl = container.querySelector('#sidebar-filter-empty-copy');
    this.emptyActionBtn = container.querySelector('#sidebar-filter-empty-action');
    this.sidebarContainer = container.querySelector('.sl-sidebar-persist');

    if (!this.input || !this.sidebarContainer) {
      // Fallback: look for the ul.top-level directly
      this.sidebarContainer = container.querySelector('ul.top-level')?.parentElement ?? null;
    }
    if (!this.input) return;

    this.input.addEventListener('input', () => this.handleInput(), { signal });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.clear();
        this.input?.focus();
      }
    }, { signal });

    this.clearBtn?.addEventListener('click', () => {
      this.clear();
      this.input?.focus();
    }, { signal });

    this.emptyActionBtn?.addEventListener('click', () => {
      this.clear();
      this.input?.focus();
    }, { signal });
  }

  private handleInput(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(
      () => this.applyFilter(),
      SidebarFilterController.DEBOUNCE_MS
    );
  }

  private clear(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.input) this.input.value = '';
    this.applyFilter();
  }

  private applyFilter(): void {
    if (this.controller.signal.aborted) return;
    const query = this.input?.value.trim().toLowerCase() ?? '';
    const hasQuery = query.length > 0;

    // Toggle clear button visibility
    if (this.clearBtn) {
      this.clearBtn.hidden = !hasQuery;
    }

    const topList = this.sidebarContainer?.querySelector('ul.top-level') as HTMLElement | null;
    if (!topList) return;

    if (!hasQuery) {
      this.resetAll(topList);
      this.updateStatus((this.statusEl?.dataset.countTemplate ?? '')
        .replace('{{count}}', String(topList.querySelectorAll('a').length)));
      this.updateEmptyState(false, '');
      return;
    }

    let visibleCount = 0;
    const topItems = topList.querySelectorAll(':scope > li');

    for (const li of topItems) {
      visibleCount += this.filterItem(li as HTMLElement, query);
    }

    if (visibleCount === 0) {
      this.updateEmptyState(true, this.input?.value.trim() ?? '');
    } else {
      this.updateStatus((this.statusEl?.dataset.countTemplate ?? '').replace('{{count}}', String(visibleCount)));
      this.updateEmptyState(false, '');
    }
  }

  /**
   * CamelCase match: "dab" matches DistributedApplicationBuilder.
   */
  private camelMatch(text: string, query: string): boolean {
    const uppers = text.replace(/[^A-Z]/g, '').toLowerCase();
    return uppers.length >= 2 && (uppers.startsWith(query) || uppers.includes(query));
  }

  /**
   * Recursively filter a sidebar <li>.
   * Returns the number of visible leaf items within this subtree.
   */
  private filterItem(li: HTMLElement, query: string): number {
    const details = li.querySelector(':scope > details') as HTMLDetailsElement | null;

    if (details) {
      // Group item (has children)
      const summary = details.querySelector(':scope > summary');
      const labelEl = summary?.querySelector(
        '.group-label .large, .group-label'
      ) as HTMLElement | null;
      const groupLabel = (labelEl?.textContent ?? '').trim();
      const groupLower = groupLabel.toLowerCase();
      const groupMatches = groupLower.includes(query) || this.camelMatch(groupLabel, query);

      // Filter children
      const childList = details.querySelector(':scope > ul');
      const childItems = childList?.querySelectorAll(':scope > li') ?? [];
      let childVisible = 0;

      for (const childLi of childItems) {
        childVisible += this.filterItem(childLi as HTMLElement, query);
      }

      if (groupMatches) {
        // Group label matches — show the group and ALL children
        li.style.display = '';
        if (labelEl) this.highlightText(labelEl, query);
        this.showAllChildren(details as HTMLElement);
        (details as HTMLDetailsElement).open = true;
        return this.countLeafItems(details as HTMLElement);
      } else if (childVisible > 0) {
        // Some children match — show the group, keep it open
        li.style.display = '';
        if (labelEl) this.clearHighlight(labelEl);
        (details as HTMLDetailsElement).open = true;
        return childVisible;
      } else {
        // Nothing matches — hide the group
        li.style.display = 'none';
        if (labelEl) this.clearHighlight(labelEl);
        return 0;
      }
    } else {
      // Leaf item (link)
      const link = li.querySelector(':scope > a') as HTMLElement | null;
      const label = (link?.textContent ?? '').trim();
      const labelLower = label.toLowerCase();
      const matches = labelLower.includes(query) || this.camelMatch(label, query);
      li.style.display = matches ? '' : 'none';
      if (link) {
        if (matches && query) {
          this.highlightText(link, query);
        } else {
          this.clearHighlight(link);
        }
      }
      return matches ? 1 : 0;
    }
  }

  /** Highlight matching text within an element */
  private highlightText(el: HTMLElement, query: string): void {
    this.clearHighlight(el);
    if (!query) {
      return;
    }

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const text = node.textContent ?? '';
        const parent = node.parentElement;
        if (!parent || !text.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        if (parent.closest('mark.sb-hl, .sl-badge, .starlight-sidebar-topics-badge')) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let textNode: Text | null = null;
    let matchIndex = -1;

    while (walker.nextNode()) {
      const candidate = walker.currentNode as Text;
      const candidateText = candidate.textContent ?? '';
      const idx = candidateText.toLowerCase().indexOf(query);
      if (idx >= 0) {
        textNode = candidate;
        matchIndex = idx;
        break;
      }
    }

    if (!textNode || matchIndex < 0) {
      return;
    }

    const range = document.createRange();
    range.setStart(textNode, matchIndex);
    range.setEnd(textNode, matchIndex + query.length);

    const mark = document.createElement('mark');
    mark.className = 'sb-hl';
    range.surroundContents(mark);
  }

  /** Remove highlights from an element */
  private clearHighlight(el: HTMLElement): void {
    const marks = el.querySelectorAll('mark.sb-hl');
    if (marks.length === 0) return;

    for (const mark of marks) {
      mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
    }

    el.normalize();
  }

  /** Show all descendants (reset display) */
  private showAllChildren(parent: HTMLElement): void {
    const childItems = parent.querySelectorAll('li');
    for (const li of childItems) {
      (li as HTMLElement).style.display = '';
    }
  }

  /** Count leaf items (links, not groups) in a subtree */
  private countLeafItems(parent: HTMLElement): number {
    return parent.querySelectorAll('a[href]').length;
  }

  /** Reset all items to visible and restore collapsed state */
  private resetAll(topList: HTMLElement): void {
    const allItems = topList.querySelectorAll('li');
    for (const li of allItems) {
      (li as HTMLElement).style.display = '';
    }
    // Clear highlights
    topList.querySelectorAll('mark.sb-hl').forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
    });
    topList.normalize();
    // Re-collapse groups that aren't on the current page path
    const allDetails = topList.querySelectorAll('details');
    for (const details of allDetails) {
      const hasCurrent = details.querySelector('[aria-current="page"]');
      if (!hasCurrent) {
        (details as HTMLDetailsElement).open = false;
      }
    }
  }

  private updateStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  private updateEmptyState(show: boolean, query: string): void {
    if (!this.emptyEl || !this.emptyCopyEl) {
      return;
    }

    this.emptyEl.hidden = !show;
    if (!show) {
      this.emptyCopyEl.textContent = '';
      return;
    }

    const title = this.emptyEl.dataset.message ?? '';
    const message = query ? `${title} — “${query}”.` : title;
    this.emptyCopyEl.textContent = message;
    // Also surface the message through the polite live region so screen
    // readers hear *why* the list is empty, not just "0 matches".
    this.updateStatus(message);
  }
}

const TOPIC_SIDEBAR_COLLAPSED_KEY = 'topic-sidebar-collapsed';
function setSidebarDropdownOpen(dropdown: HTMLElement, isOpen: boolean): void {
  const trigger = dropdown.querySelector<HTMLElement>('[data-dropdown-trigger]');
  const panel = dropdown.querySelector<HTMLElement>('[data-dropdown-panel]');
  if (!trigger || !panel) {
    return;
  }

  dropdown.dataset.open = isOpen ? 'true' : 'false';
  trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  panel.hidden = !isOpen;
}

function closeAllSidebarDropdowns(except?: HTMLElement): void {
  const dropdowns = document.querySelectorAll<HTMLElement>('[data-sidebar-dropdown]');
  for (const dropdown of dropdowns) {
    if (except && dropdown === except) {
      continue;
    }
    setSidebarDropdownOpen(dropdown, false);
  }
}

function initSidebarDropdowns(): void {
  const dropdowns = document.querySelectorAll<HTMLElement>('[data-sidebar-dropdown]');

  for (const dropdown of dropdowns) {
    const trigger = dropdown.querySelector<HTMLElement>('[data-dropdown-trigger]');
    const panel = dropdown.querySelector<HTMLElement>('[data-dropdown-panel]');
    if (!trigger || !panel) {
      continue;
    }

    if (dropdown.dataset.bound === 'true') {
      continue;
    }

    dropdown.dataset.bound = 'true';
    setSidebarDropdownOpen(dropdown, false);

    trigger.addEventListener('click', () => {
      const isOpen = dropdown.dataset.open === 'true';
      closeAllSidebarDropdowns(isOpen ? undefined : dropdown);
      setSidebarDropdownOpen(dropdown, !isOpen);
    });

    panel.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a[href]')) {
        setSidebarDropdownOpen(dropdown, false);
      }
    });

    dropdown.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setSidebarDropdownOpen(dropdown, false);
        trigger.focus();
      }
    });
  }

  if (!(window as any).__sidebarDropdownHandlers) {
    (window as any).__sidebarDropdownHandlers = true;

    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-sidebar-dropdown]')) {
        closeAllSidebarDropdowns();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAllSidebarDropdowns();
      }
    });
  }
}

/**
 * Handle Ctrl+K / Cmd+K on API reference pages.
 * Routes to #api-search-input (the main search on the index page) if present,
 * otherwise falls back to the sidebar filter input.
 *
 * Because Search.astro does not render <site-search> on API pages, there is
 * no competing Pagefind handler — we just need to prevent the browser default.
 */
function handleApiSearchShortcut(e: KeyboardEvent) {
  // Only act when on an API ref page (signalled by server-rendered attribute)
  if (!document.querySelector('.topics-sidebar[data-api-ref]')) return;
  if (!((e.ctrlKey || e.metaKey) && e.key === 'k')) return;

  e.preventDefault();

  // Prefer the page-level API search input; fall back to sidebar filter
  const target =
    (document.getElementById('api-search-input') as HTMLInputElement | null) ??
    (document.getElementById('sidebar-filter-input') as HTMLInputElement | null);

  if (target) {
    target.focus();
    target.select();
  }
}

// Initialize on load and after Astro client-side navigation
function initSidebarFilter() {
  new SidebarFilterController();
}

/* ── Sidebar collapse / expand toggle ─────────────────────────── */

const SIDEBAR_COLLAPSED_KEY = 'api-sidebar-collapsed';
const SIDEBAR_READY_ATTR = 'data-api-sidebar-ready';
const TOPIC_SIDEBAR_READY_ATTR = 'data-topic-sidebar-ready';

/* Briefly tagging <html> with `data-sidebar-expanding` /
   `data-topic-sidebar-expanding` while the rail → expanded transition
   plays lets the filter and sidebar entries run a subtle blur-in
   animation as they re-enter the layout. The flag clears just after
   the underlying width transition (250ms) finishes. */
const SIDEBAR_EXPAND_ANIMATION_MS = 320;
let sidebarExpandTimer = 0;
let topicSidebarExpandTimer = 0;

// Module-scoped observers so a re-init disconnects the previous instances.
let bannerMutationObserver: MutationObserver | null = null;
let bannerResizeObserver: ResizeObserver | null = null;

function safeSetItem(key: string, value: string): void {
  // localStorage can throw in private browsing / quota-exceeded /
  // sandboxed iframes. Failing silently is the right call here — the
  // in-memory DOM state still works, we just won't persist.
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function setSidebarReady(ready: boolean): void {
  if (ready) {
    document.documentElement.setAttribute(SIDEBAR_READY_ATTR, '');
  } else {
    document.documentElement.removeAttribute(SIDEBAR_READY_ATTR);
  }
}

function setTopicSidebarReady(ready: boolean): void {
  if (ready) {
    document.documentElement.setAttribute(TOPIC_SIDEBAR_READY_ATTR, '');
  } else {
    document.documentElement.removeAttribute(TOPIC_SIDEBAR_READY_ATTR);
  }
}

/**
 * Keep the disclosure-button pair semantically correct: only one button
 * in each pair is visually present (the other is `visibility: hidden`),
 * so only the visible one should advertise `aria-controls` /
 * `aria-expanded`. The hidden one gets `aria-hidden="true"` and drops
 * those attrs entirely, so assistive tech sees a single live control
 * for the sidebar disclosure at any time.
 */
function syncToggleA11y(
  collapseBtn: HTMLElement,
  expandBtn: HTMLElement,
  isCollapsed: boolean
): void {
  const active = isCollapsed ? expandBtn : collapseBtn;
  const inactive = isCollapsed ? collapseBtn : expandBtn;

  active.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  active.setAttribute('aria-controls', 'starlight__sidebar');
  active.removeAttribute('aria-hidden');

  inactive.setAttribute('aria-hidden', 'true');
  inactive.removeAttribute('aria-expanded');
  inactive.removeAttribute('aria-controls');
}

function initSidebarCollapse() {
  setSidebarReady(false);
  // Clear any pending expand-animation flag carried over from the
  // previous page so it can't fire on the next page mid-navigation.
  window.clearTimeout(sidebarExpandTimer);
  document.documentElement.removeAttribute('data-sidebar-expanding');

  const container = document.querySelector('.topics-sidebar[data-api-ref]');
  if (!container) {
    // Not an API page — remove stale collapsed state from a previous API page visit
    document.documentElement.removeAttribute('data-sidebar-collapsed');
    return;
  }

  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  if (!collapseBtn || !expandBtn) return;

  // Sync aria-expanded with the data-sidebar-collapsed attribute that
  // Head.astro set from localStorage before this script ran.
  syncToggleA11y(
    collapseBtn,
    expandBtn,
    document.documentElement.hasAttribute('data-sidebar-collapsed')
  );

  if (collapseBtn.dataset.bound !== 'true') {
    collapseBtn.dataset.bound = 'true';
    collapseBtn.addEventListener('click', () => {
      setSidebarCollapsed(true, expandBtn, collapseBtn);
      safeSetItem(SIDEBAR_COLLAPSED_KEY, '1');
    });
  }

  if (expandBtn.dataset.bound !== 'true') {
    expandBtn.dataset.bound = 'true';
    expandBtn.addEventListener('click', () => {
      setSidebarCollapsed(false, expandBtn, collapseBtn);
      safeSetItem(SIDEBAR_COLLAPSED_KEY, '0');
    });
  }

  setSidebarReady(true);
}

function initTopicSidebarCollapse() {
  setTopicSidebarReady(false);
  window.clearTimeout(topicSidebarExpandTimer);
  document.documentElement.removeAttribute('data-topic-sidebar-expanding');

  const container = document.querySelector('.topics-sidebar[data-topic-nav]');
  if (!container) {
    document.documentElement.removeAttribute('data-topic-sidebar-collapsed');
    return;
  }

  const collapseBtn = document.getElementById('topic-sidebar-collapse-btn');
  const expandBtn = document.getElementById('topic-sidebar-expand-btn');
  if (!collapseBtn || !expandBtn) {
    return;
  }

  syncToggleA11y(
    collapseBtn,
    expandBtn,
    document.documentElement.hasAttribute('data-topic-sidebar-collapsed')
  );

  if (collapseBtn.dataset.bound !== 'true') {
    collapseBtn.dataset.bound = 'true';
    collapseBtn.addEventListener('click', () => {
      setTopicSidebarCollapsed(true, expandBtn, collapseBtn);
      safeSetItem(TOPIC_SIDEBAR_COLLAPSED_KEY, '1');
    });
  }

  if (expandBtn.dataset.bound !== 'true') {
    expandBtn.dataset.bound = 'true';
    expandBtn.addEventListener('click', () => {
      setTopicSidebarCollapsed(false, expandBtn, collapseBtn);
      safeSetItem(TOPIC_SIDEBAR_COLLAPSED_KEY, '0');
    });
  }

  setTopicSidebarReady(true);
}

function setTopicSidebarCollapsed(
  collapsed: boolean,
  expandBtn: HTMLElement,
  collapseBtn: HTMLElement
): void {
  const root = document.documentElement;
  const wasCollapsed = root.hasAttribute('data-topic-sidebar-collapsed');

  if (collapsed) {
    window.clearTimeout(topicSidebarExpandTimer);
    root.removeAttribute('data-topic-sidebar-expanding');
    root.setAttribute('data-topic-sidebar-collapsed', '');
    syncToggleA11y(collapseBtn, expandBtn, true);
    // Focus the now-visible button so keyboard users stay anchored.
    try {
      expandBtn.focus({ preventScroll: true });
    } catch {
      expandBtn.focus();
    }
  } else {
    // Only run the blur-in animation when actually transitioning from
    // a collapsed state — not on initial load when we're already expanded.
    if (wasCollapsed) {
      root.setAttribute('data-topic-sidebar-expanding', '');
      window.clearTimeout(topicSidebarExpandTimer);
      topicSidebarExpandTimer = window.setTimeout(() => {
        root.removeAttribute('data-topic-sidebar-expanding');
      }, SIDEBAR_EXPAND_ANIMATION_MS);
    }
    root.removeAttribute('data-topic-sidebar-collapsed');
    syncToggleA11y(collapseBtn, expandBtn, false);
    if (wasCollapsed) {
      try {
        collapseBtn.focus({ preventScroll: true });
      } catch {
        collapseBtn.focus();
      }
    }
  }
}

function initTopicSidebarUi() {
  initSidebarDropdowns();
  initTopicSidebarCollapse();
}

function setSidebarCollapsed(
  collapsed: boolean,
  expandBtn: HTMLElement,
  collapseBtn: HTMLElement
) {
  const root = document.documentElement;
  const wasCollapsed = root.hasAttribute('data-sidebar-collapsed');

  if (collapsed) {
    window.clearTimeout(sidebarExpandTimer);
    root.removeAttribute('data-sidebar-expanding');
    root.setAttribute('data-sidebar-collapsed', '');
    syncToggleA11y(collapseBtn, expandBtn, true);
    try {
      expandBtn.focus({ preventScroll: true });
    } catch {
      expandBtn.focus();
    }
  } else {
    if (wasCollapsed) {
      root.setAttribute('data-sidebar-expanding', '');
      window.clearTimeout(sidebarExpandTimer);
      sidebarExpandTimer = window.setTimeout(() => {
        root.removeAttribute('data-sidebar-expanding');
      }, SIDEBAR_EXPAND_ANIMATION_MS);
    }
    root.removeAttribute('data-sidebar-collapsed');
    syncToggleA11y(collapseBtn, expandBtn, false);
    if (wasCollapsed) {
      try {
        collapseBtn.focus({ preventScroll: true });
      } catch {
        collapseBtn.focus();
      }
    }
  }
}

document.addEventListener('keydown', handleApiSearchShortcut);
onReady(() => {
  initSidebarFilter();
  initSidebarCollapse();
  initTopicSidebarUi();
  initBannerHeightTracking();
  teleportSidebarToggles();
});

/* ── Sidebar toggle teleport ──────────────────────────────────── */

/**
 * Move the floating sidebar collapse/expand toggle buttons to
 * `<body>` so they escape the sidebar's stacking context. The
 * sidebar pane lives in its own flex column; its descendants —
 * even those with `position: fixed` — are still painted within
 * the sidebar's flex item, which the main content area paints
 * over. Reparenting to `<body>` puts the toggle in the root
 * stacking context where its `z-index` actually wins, so mouse
 * clicks reach the button instead of the page content beneath.
 */
function teleportSidebarToggles() {
  const ids = [
    'sidebar-collapse-btn',
    'sidebar-expand-btn',
    'topic-sidebar-collapse-btn',
    'topic-sidebar-expand-btn',
  ];
  // Defensive sweep: if any stale teleported buttons survived the
  // last swap (e.g. an aborted view transition), drop them so they
  // can't shadow the fresh in-sidebar buttons via getElementById.
  for (const id of ids) {
    const matches = document.querySelectorAll<HTMLElement>(`#${id}`);
    if (matches.length <= 1) continue;
    matches.forEach((btn) => {
      if (btn.parentElement === document.body) {
        btn.remove();
      }
    });
  }

  for (const id of ids) {
    const btn = document.getElementById(id);
    if (btn && btn.parentElement !== document.body) {
      document.body.appendChild(btn);
    }
  }
}

/* ── Banner height tracking ───────────────────────────────────── */

/**
 * Measure the announcement banner's height (if present and open) and
 * write it to `--aspire-banner-height` on the root element so floating
 * UI (the sidebar collapse/expand toggle) can offset itself below it.
 * Updates on dismiss/state changes and on window resize.
 */
function initBannerHeightTracking() {
  const root = document.documentElement;
  const update = () => {
    const banner = document.querySelector('.sl-banner') as HTMLElement | null;
    const open = banner && banner.dataset.bannerState !== 'closing' && !banner.hidden;
    const height = open ? Math.round(banner.getBoundingClientRect().height) : 0;
    if (height > 0) {
      root.style.setProperty('--aspire-banner-height', `${height}px`);
    } else {
      root.style.removeProperty('--aspire-banner-height');
    }
  };

  update();

  const banner = document.querySelector('.sl-banner') as HTMLElement | null;
  if (banner) {
    // Disconnect any prior observers before re-attaching so we don't
    // accumulate one set per client-side navigation.
    bannerMutationObserver?.disconnect();
    bannerResizeObserver?.disconnect();

    // Track state changes (open → closing) emitted by Banner.astro's controller
    bannerMutationObserver = new MutationObserver(update);
    bannerMutationObserver.observe(banner, {
      attributes: true,
      attributeFilter: ['data-banner-state', 'hidden'],
    });
    // Track size changes too (e.g. responsive line-wrap)
    if (typeof ResizeObserver !== 'undefined') {
      bannerResizeObserver = new ResizeObserver(update);
      bannerResizeObserver.observe(banner);
    }
  } else {
    bannerMutationObserver?.disconnect();
    bannerResizeObserver?.disconnect();
    bannerMutationObserver = null;
    bannerResizeObserver = null;
  }

  if (!(window as any).__bannerHeightResizeBound) {
    (window as any).__bannerHeightResizeBound = true;
    window.addEventListener('resize', update);
  }
}

/* ── Sticky sidebar offsets & auto-scroll ─────────────────────── */

/**
 * Set up sticky positioning for the sidebar header and filter.
 * Also scrolls the active sidebar item into view.
 */
function setupStickySidebar() {
  const sidebar = document.querySelector('.topics-sidebar[data-api-ref]') as HTMLElement | null;
  if (!sidebar) return;

  // Auto-scroll the active item into view
  scrollToActive(sidebar);
}

/**
 * Scroll the sidebar so the currently active item is visible,
 * positioned roughly in the upper third of the visible area.
 */
function scrollToActive(sidebar: Element) {
  const scrollContainer = sidebar.closest('.sidebar-pane');
  if (!scrollContainer) return;

  const activeLink = sidebar.querySelector('[aria-current="page"]') as HTMLElement | null;
  if (!activeLink) return;

  // Wait a tick for sticky layout to settle
  requestAnimationFrame(() => {
    const containerRect = scrollContainer.getBoundingClientRect();
    const activeRect = activeLink.getBoundingClientRect();

    // Check if active item is already fully visible
    if (activeRect.top >= containerRect.top && activeRect.bottom <= containerRect.bottom) {
      return; // Already visible, no scroll needed
    }

    // Scroll so active item is in the upper third of the visible area
    const targetOffset = activeRect.top - containerRect.top - containerRect.height / 3;
    scrollContainer.scrollTop += targetOffset;
  });
}

onReady(() => requestAnimationFrame(setupStickySidebar));
