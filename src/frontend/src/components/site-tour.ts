declare global {
  interface Window {
    __aspireSiteTour?: AspireSiteTour;
  }
}

export type SiteTourStepId =
  | 'sidebar-toggle'
  | 'topics-dropdown'
  | 'search'
  | 'install-cli'
  | 'cookie-preferences'
  | 'tour-help'
  | 'page-actions'
  | 'pivot-selector'
  | 'edit-page'
  | 'footer-preferences'
  | 'scroll-to-top';

export type SiteTourFilterMode = 'all' | 'new' | 'single';

export interface SiteTourStrings {
  eyebrow: string;
  quickTip: string;
  progress: string;
  unavailable: string;
  labels: {
    dismiss: string;
    previous: string;
    restart: string;
    next: string;
    finish: string;
    close: string;
  };
  trigger: {
    viewNewTip: string;
    viewNewTips: string;
    resume: string;
    start: string;
  };
  tooltips: {
    restart: string;
    closeQuickTip: string;
    finish: string;
    previous: string;
    next: string;
    firstStep: string;
    currentStep: string;
    jumpToStep: string;
  };
  hint: {
    scrollToTop: string;
  };
  steps: {
    sidebarToggle: SiteTourCopy;
    topicsDropdown: SiteTourCopy;
    search: SiteTourCopy;
    installCli: SiteTourCopy;
    cookiePreferences: SiteTourCopy;
    tourHelp: SiteTourCopy;
    pageActions: SiteTourCopy;
    pivotSelector: SiteTourCopy;
    editPage: SiteTourCopy;
    footerPreferences: SiteTourCopy;
    scrollToTop: SiteTourCopy;
  };
}

interface SiteTourCopy {
  title: string;
  body: string;
}

export interface SiteTourStepDefinition {
  id: SiteTourStepId;
  title: string;
  body: string;
  selectors: string[];
}

export interface SiteTourState {
  started: boolean;
  completed: boolean;
  hasCompletedOnce: boolean;
  currentStepId: SiteTourStepId;
  seenStepIds: SiteTourStepId[];
}

interface TourSegments {
  top: HTMLDivElement;
  left: HTMLDivElement;
  right: HTMLDivElement;
  bottom: HTMLDivElement;
}

interface HighlightRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface SuppressedTooltipState {
  hadTitle: boolean;
  title: string | null;
  tippy?: TippyLike;
  tippyWasEnabled: boolean;
}

interface TippyLike {
  hide(): void;
  disable(): void;
  enable(): void;
  state?: {
    isEnabled?: boolean;
  };
}

type TooltipElement = HTMLElement & { _tippy?: TippyLike };

export const SITE_TOUR_STORAGE_KEY = 'aspire-site-tour-v1';
export const SITE_TOUR_MOBILE_MEDIA_QUERY = '(max-width: 49.999rem)';
export const SITE_TOUR_STEP_ORDER = [
  'sidebar-toggle',
  'topics-dropdown',
  'search',
  'install-cli',
  'cookie-preferences',
  'tour-help',
  'page-actions',
  'pivot-selector',
  'edit-page',
  'footer-preferences',
  'scroll-to-top',
] as const satisfies readonly SiteTourStepId[];

function assertElement<T extends Element>(
  element: Element | null,
  ctor: abstract new (...args: never[]) => T,
  message: string
): T {
  if (!(element instanceof ctor)) {
    throw new Error(message);
  }

  return element;
}

export function interpolate(
  template: string,
  values: Record<string, string | number> = {}
): string {
  return String(template ?? '').replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createSiteTourStepDefinitions(strings: SiteTourStrings): SiteTourStepDefinition[] {
  return [
    {
      id: 'sidebar-toggle',
      title: strings.steps.sidebarToggle.title,
      body: strings.steps.sidebarToggle.body,
      selectors: ['[data-tour-step="sidebar-toggle"]', '[data-tour-target="sidebar-toggle"]'],
    },
    {
      id: 'topics-dropdown',
      title: strings.steps.topicsDropdown.title,
      body: strings.steps.topicsDropdown.body,
      selectors: [
        '[data-tour-step="topics-dropdown"] [data-dropdown-trigger]',
        '[data-tour-target="topics-dropdown"] [data-dropdown-trigger]',
        '[data-tour-step="topics-dropdown"]',
        '[data-tour-target="topics-dropdown"]',
      ],
    },
    {
      id: 'search',
      title: strings.steps.search.title,
      body: strings.steps.search.body,
      selectors: [
        '[data-tour-target="search"] button',
        '[data-tour-step="search"] button',
        '[data-tour-step="search"]',
        '[data-tour-target="search"]',
      ],
    },
    {
      id: 'install-cli',
      title: strings.steps.installCli.title,
      body: strings.steps.installCli.body,
      selectors: ['[data-tour-step="install-cli"]', '[data-tour-target="install-cli"]'],
    },
    {
      id: 'cookie-preferences',
      title: strings.steps.cookiePreferences.title,
      body: strings.steps.cookiePreferences.body,
      selectors: [
        '[data-tour-step="cookie-preferences"]',
        '[data-tour-target="cookie-preferences"]',
      ],
    },
    {
      id: 'tour-help',
      title: strings.steps.tourHelp.title,
      body: strings.steps.tourHelp.body,
      selectors: ['[data-tour-step="tour-help"]', '[data-tour-target="tour-help"]'],
    },
    {
      id: 'page-actions',
      title: strings.steps.pageActions.title,
      body: strings.steps.pageActions.body,
      selectors: ['[data-tour-step="page-actions"]', '[data-tour-target="page-actions"]'],
    },
    {
      id: 'pivot-selector',
      title: strings.steps.pivotSelector.title,
      body: strings.steps.pivotSelector.body,
      selectors: ['[data-tour-step="pivot-selector"]', '[data-tour-target="pivot-selector"]'],
    },
    {
      id: 'edit-page',
      title: strings.steps.editPage.title,
      body: strings.steps.editPage.body,
      selectors: ['[data-tour-step="edit-page"]', '[data-tour-target="edit-page"]'],
    },
    {
      id: 'footer-preferences',
      title: strings.steps.footerPreferences.title,
      body: strings.steps.footerPreferences.body,
      selectors: [
        '[data-tour-step="footer-preferences"]',
        '[data-tour-target="footer-preferences"]',
      ],
    },
    {
      id: 'scroll-to-top',
      title: strings.steps.scrollToTop.title,
      body: strings.steps.scrollToTop.body,
      selectors: [
        '#scroll-to-top-button',
        '[data-tour-step="scroll-to-top"]',
        '[data-tour-target="scroll-to-top"]',
      ],
    },
  ];
}

export function getDefaultSiteTourState(
  firstStepId: SiteTourStepId = SITE_TOUR_STEP_ORDER[0]
): SiteTourState {
  return {
    started: false,
    completed: false,
    hasCompletedOnce: false,
    currentStepId: firstStepId,
    seenStepIds: [],
  };
}

export function parseSiteTourState(
  raw: string | null,
  firstStepId: SiteTourStepId = SITE_TOUR_STEP_ORDER[0]
): SiteTourState {
  const fallback = getDefaultSiteTourState(firstStepId);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SiteTourState>;
    return {
      ...fallback,
      ...parsed,
      currentStepId:
        parsed.currentStepId && SITE_TOUR_STEP_ORDER.includes(parsed.currentStepId)
          ? parsed.currentStepId
          : fallback.currentStepId,
      seenStepIds: Array.isArray(parsed.seenStepIds)
        ? parsed.seenStepIds.filter((stepId): stepId is SiteTourStepId =>
            SITE_TOUR_STEP_ORDER.includes(stepId)
          )
        : fallback.seenStepIds,
    };
  } catch {
    return fallback;
  }
}

export function isLocaleSegment(segment: string): boolean {
  return /^[a-z]{2}(?:-[a-z]{2})?$/i.test(segment);
}

export function isLandingPath(pathname: string): boolean {
  const parts = pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (parts.length === 0) {
    return true;
  }

  return parts.length === 1 && isLocaleSegment(parts[0]);
}

export function getStepHighlightPadding(stepId: string): number {
  if (stepId === 'search') {
    return 2;
  }

  return 12;
}

export function resolveStoredStepIndex(
  steps: ReadonlyArray<{ id: string }>,
  currentStepId: string
): number {
  if (steps.length === 0) {
    return 0;
  }

  const exactIndex = steps.findIndex((step) => step.id === currentStepId);
  if (exactIndex !== -1) {
    return exactIndex;
  }

  const fallbackOrder = SITE_TOUR_STEP_ORDER.indexOf(currentStepId as SiteTourStepId);
  if (fallbackOrder !== -1) {
    const nextIndex = steps.findIndex(
      (step) => SITE_TOUR_STEP_ORDER.indexOf(step.id as SiteTourStepId) >= fallbackOrder
    );
    if (nextIndex !== -1) {
      return nextIndex;
    }

    for (let index = steps.length - 1; index >= 0; index -= 1) {
      if (SITE_TOUR_STEP_ORDER.indexOf(steps[index].id as SiteTourStepId) < fallbackOrder) {
        return index;
      }
    }
  }

  return 0;
}

export function filterStepDefinitions(
  steps: ReadonlyArray<SiteTourStepDefinition>,
  seenStepIds: readonly SiteTourStepId[],
  filterMode: SiteTourFilterMode,
  singleStepId: SiteTourStepId | null
): SiteTourStepDefinition[] {
  if (filterMode === 'new') {
    return steps.filter((step) => !seenStepIds.includes(step.id));
  }

  if (filterMode === 'single' && singleStepId) {
    return steps.filter((step) => step.id === singleStepId);
  }

  return [...steps];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isUsableTarget(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.hidden) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isMobileTourViewport(): boolean {
  return window.matchMedia(SITE_TOUR_MOBILE_MEDIA_QUERY).matches;
}

class AspireSiteTour {
  private readonly strings: SiteTourStrings;
  private readonly stepDefinitions: SiteTourStepDefinition[];
  private state: SiteTourState;
  private isOpen = false;
  private currentIndex = 0;
  private steps: SiteTourStepDefinition[] = [];
  private activeStepIds: SiteTourStepId[] | null = null;
  private stepFilterMode: SiteTourFilterMode = 'all';
  private singleStepId: SiteTourStepId | null = null;
  private renderFrame = 0;
  private bound = false;
  private pendingRenderTimers: number[] = [];
  private refreshRetryTimer: number | null = null;
  private refreshRetryCount = 0;
  private singleStepMode = false;
  private lastPath = window.location.pathname;
  private lastFocusedElement: HTMLElement | null = null;
  private managedFocusTarget: HTMLElement | null = null;
  private lastRenderedStepId: SiteTourStepId | null = null;
  private suppressedTooltipState = new Map<TooltipElement, SuppressedTooltipState>();
  private root: HTMLDivElement | null = null;
  private spotlight: HTMLDivElement | null = null;
  private card: HTMLElement | null = null;
  private title: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private hint: HTMLElement | null = null;
  private progress: HTMLElement | null = null;
  private stepNav: HTMLElement | null = null;
  private previousButton: HTMLButtonElement | null = null;
  private nextButton: HTMLButtonElement | null = null;
  private restartButton: HTMLButtonElement | null = null;
  private closeButton: HTMLButtonElement | null = null;
  private segments: TourSegments | null = null;

  constructor(strings: SiteTourStrings) {
    this.strings = strings;
    this.stepDefinitions = createSiteTourStepDefinitions(strings);
    this.state = parseSiteTourState(localStorage.getItem(SITE_TOUR_STORAGE_KEY));
  }

  init(): void {
    this.ensureRoot();
    this.bindEvents();
    this.refresh();
  }

  clearPendingPaintLock(): void {
    document.documentElement.removeAttribute('data-site-tour-pending');
  }

  refresh(): void {
    const currentPath = window.location.pathname;
    const hasNavigated = this.lastPath !== currentPath;
    this.lastPath = currentPath;

    this.ensureRoot();
    this.ensurePageMarkers();

    if (hasNavigated && this.isOpen) {
      this.close(!this.singleStepMode);
    }

    this.steps = this.buildSteps();
    this.syncHelpButtons();

    if (!this.isEnabled() || isLandingPath(window.location.pathname)) {
      this.clearRefreshRetry();
      this.clearPendingPaintLock();
      this.close(false);
      return;
    }

    if (this.steps.length === 0) {
      this.scheduleRefreshRetry();
      this.clearPendingPaintLock();
      this.close(false);
      return;
    }

    this.clearRefreshRetry();
    this.clearPendingPaintLock();

    if (this.isOpen) {
      if (!this.singleStepMode) {
        this.currentIndex = this.resolveStoredIndex();
      }
      this.render(true);
    }
  }

  private ensureRoot(): void {
    if (this.root && document.body.contains(this.root)) {
      return;
    }

    const root = document.createElement('div');
    root.className = 'aspire-site-tour-layer';
    root.hidden = true;
    root.innerHTML = `
      <div class="aspire-site-tour-backdrop" data-tour-segment="top"></div>
      <div class="aspire-site-tour-backdrop" data-tour-segment="left"></div>
      <div class="aspire-site-tour-backdrop" data-tour-segment="right"></div>
      <div class="aspire-site-tour-backdrop" data-tour-segment="bottom"></div>
      <div class="aspire-site-tour-spotlight"></div>
      <section class="aspire-site-tour-card" role="dialog" aria-modal="true" aria-labelledby="aspire-site-tour-title">
        <div class="aspire-site-tour-card-head">
          <div class="aspire-site-tour-copy">
            <p class="aspire-site-tour-eyebrow">${escapeHtml(this.strings.eyebrow)}</p>
            <h2 class="aspire-site-tour-title" id="aspire-site-tour-title"></h2>
          </div>
          <button type="button" class="aspire-site-tour-close" data-tour-action="dismiss" aria-label="${escapeHtml(this.strings.labels.dismiss)}">&times;</button>
        </div>
        <p class="aspire-site-tour-body"></p>
        <p class="aspire-site-tour-hint" hidden></p>
        <div class="aspire-site-tour-footer">
          <span class="aspire-site-tour-progress"></span>
          <div class="aspire-site-tour-step-nav" hidden></div>
          <div class="aspire-site-tour-actions">
            <button type="button" class="aspire-site-tour-btn aspire-site-tour-btn-secondary" data-tour-action="previous">
              <span class="aspire-site-tour-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13 8H3" />
                  <path d="m7 12l-4-4l4-4" />
                </svg>
              </span>
              <span class="aspire-site-tour-btn-label">${escapeHtml(this.strings.labels.previous)}</span>
            </button>
            <button type="button" class="aspire-site-tour-btn aspire-site-tour-btn-secondary" data-tour-action="restart">
              <span class="aspire-site-tour-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
                  <path d="M2.5 3.2v3.2h3.2" />
                </svg>
              </span>
              <span class="aspire-site-tour-btn-label">${escapeHtml(this.strings.labels.restart)}</span>
            </button>
            <button type="button" class="aspire-site-tour-btn aspire-site-tour-btn-primary" data-tour-action="next">
              <span class="aspire-site-tour-btn-label">${escapeHtml(this.strings.labels.next)}</span>
              <span class="aspire-site-tour-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 8h10" />
                  <path d="m9 4l4 4l-4 4" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </section>
    `;

    document.body.append(root);

    this.root = root;
    this.spotlight = assertElement(
      root.querySelector('.aspire-site-tour-spotlight'),
      HTMLDivElement,
      'SiteTour spotlight not found.'
    );
    this.card = assertElement(
      root.querySelector('.aspire-site-tour-card'),
      HTMLElement,
      'SiteTour card not found.'
    );
    this.title = assertElement(
      root.querySelector('.aspire-site-tour-title'),
      HTMLElement,
      'SiteTour title not found.'
    );
    this.body = assertElement(
      root.querySelector('.aspire-site-tour-body'),
      HTMLElement,
      'SiteTour body not found.'
    );
    this.hint = assertElement(
      root.querySelector('.aspire-site-tour-hint'),
      HTMLElement,
      'SiteTour hint not found.'
    );
    this.progress = assertElement(
      root.querySelector('.aspire-site-tour-progress'),
      HTMLElement,
      'SiteTour progress not found.'
    );
    this.stepNav = assertElement(
      root.querySelector('.aspire-site-tour-step-nav'),
      HTMLElement,
      'SiteTour step nav not found.'
    );
    this.previousButton = assertElement(
      root.querySelector('[data-tour-action="previous"]'),
      HTMLButtonElement,
      'SiteTour previous button not found.'
    );
    this.nextButton = assertElement(
      root.querySelector('[data-tour-action="next"]'),
      HTMLButtonElement,
      'SiteTour next button not found.'
    );
    this.restartButton = assertElement(
      root.querySelector('[data-tour-action="restart"]'),
      HTMLButtonElement,
      'SiteTour restart button not found.'
    );
    this.closeButton = assertElement(
      root.querySelector('[data-tour-action="dismiss"]'),
      HTMLButtonElement,
      'SiteTour dismiss button not found.'
    );
    this.segments = {
      top: assertElement(
        root.querySelector('[data-tour-segment="top"]'),
        HTMLDivElement,
        'SiteTour top backdrop not found.'
      ),
      left: assertElement(
        root.querySelector('[data-tour-segment="left"]'),
        HTMLDivElement,
        'SiteTour left backdrop not found.'
      ),
      right: assertElement(
        root.querySelector('[data-tour-segment="right"]'),
        HTMLDivElement,
        'SiteTour right backdrop not found.'
      ),
      bottom: assertElement(
        root.querySelector('[data-tour-segment="bottom"]'),
        HTMLDivElement,
        'SiteTour bottom backdrop not found.'
      ),
    };

    this.closeButton.addEventListener('click', () => this.close(true));
    this.restartButton.addEventListener('click', () => this.restart());
    this.previousButton.addEventListener('click', () => this.goBack());
    this.nextButton.addEventListener('click', () => this.advance());
    this.stepNav.addEventListener('click', (event) => {
      const jumpButton =
        event.target instanceof Element ? event.target.closest('[data-tour-step-index]') : null;
      if (!(jumpButton instanceof HTMLButtonElement)) {
        return;
      }

      const rawIndex = jumpButton.dataset.tourStepIndex;
      const targetIndex = Number(rawIndex);
      if (rawIndex === undefined || Number.isNaN(targetIndex)) {
        return;
      }

      this.jumpTo(targetIndex);
    });
  }

  private bindEvents(): void {
    if (this.bound) {
      return;
    }

    this.bound = true;

    document.addEventListener(
      'click',
      (event) => {
        if (event.target instanceof Element && event.target.closest('.aspire-site-tour-backdrop')) {
          this.close(true);
          this.syncHelpButtons();
          return;
        }

        if (event.target instanceof Element && this.isClickOnCurrentTarget(event.target)) {
          this.close(true);
          this.syncHelpButtons();
          return;
        }

        const trigger =
          event.target instanceof Element ? event.target.closest('[data-tour-trigger]') : null;
        if (trigger) {
          if (!this.isEnabled()) {
            return;
          }

          event.preventDefault();
          if (this.getNewSteps().length > 0) {
            this.openNew();
          } else if (!this.state.hasCompletedOnce && this.state.started && !this.state.completed) {
            this.resume();
          } else {
            this.restart();
          }
        }
      },
      true
    );

    document.addEventListener('keydown', (event) => {
      if (!this.isOpen) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.close(true);
        return;
      }

      if (event.key === 'Tab') {
        this.handleTabKey(event);
      }
    });

    window.addEventListener('resize', () => {
      this.refresh();
      this.scheduleRender();
    });
    window.addEventListener('scroll', () => this.scheduleRender(), true);
    document.addEventListener('astro:after-swap', () => this.refresh());
    document.addEventListener('astro:page-load', () => this.refresh());
  }

  private isEnabled(): boolean {
    return !isMobileTourViewport();
  }

  private ensurePageMarkers(): void {
    const actions = document.querySelector('.actions-container');
    if (actions instanceof HTMLElement) {
      actions.setAttribute('data-tour-target', 'page-actions');
      actions.setAttribute('data-tour-step', 'page-actions');
    }

    const scrollToTopButton = document.querySelector('#scroll-to-top-button');
    if (scrollToTopButton instanceof HTMLElement) {
      scrollToTopButton.setAttribute('data-tour-target', 'scroll-to-top');
      scrollToTopButton.setAttribute('data-tour-step', 'scroll-to-top');
    }
  }

  private buildSteps(filterMode: SiteTourFilterMode = this.stepFilterMode): SiteTourStepDefinition[] {
    if (!this.isEnabled()) {
      return [];
    }

    const availableSteps = this.stepDefinitions.filter((step) => {
      if (step.id === 'install-cli' && window.innerWidth < 800) {
        return false;
      }

      return this.resolveTarget(step) !== null;
    });

    return filterStepDefinitions(
      availableSteps,
      this.state.seenStepIds,
      filterMode,
      this.singleStepId
    );
  }

  private refreshActiveSteps(preserveStepId?: SiteTourStepId): boolean {
    let nextSteps = Array.isArray(this.activeStepIds) ? this.buildSteps('all') : this.buildSteps();
    if (Array.isArray(this.activeStepIds) && this.activeStepIds.length > 0) {
      const stepOrder = new Map(this.activeStepIds.map((stepId, index) => [stepId, index]));
      nextSteps = nextSteps
        .filter((step) => stepOrder.has(step.id))
        .sort((left, right) => (stepOrder.get(left.id) ?? 0) - (stepOrder.get(right.id) ?? 0));
    }

    if (nextSteps.length === 0) {
      this.steps = [];
      this.currentIndex = 0;
      return false;
    }

    this.steps = nextSteps;

    const exactIndex = preserveStepId
      ? this.steps.findIndex((step) => step.id === preserveStepId)
      : -1;
    if (exactIndex !== -1) {
      this.currentIndex = exactIndex;
      return true;
    }

    this.currentIndex = clamp(this.resolveStoredIndex(), 0, this.steps.length - 1);
    return true;
  }

  private getNewSteps(): SiteTourStepDefinition[] {
    return this.buildSteps('new');
  }

  private syncHelpButtons(): void {
    const buttons = document.querySelectorAll('[data-tour-trigger]');

    if (!this.isEnabled()) {
      buttons.forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
        button.removeAttribute('data-tour-state');
        button.removeAttribute('data-tour-badge');
        button.removeAttribute('data-tour-badge-mode');
        button.setAttribute('title', this.strings.unavailable);
        button.setAttribute('aria-label', this.strings.unavailable);
      });

      return;
    }

    const newSteps = this.getNewSteps();
    const hasNewSteps = newSteps.length > 0;
    const state = hasNewSteps
      ? 'new'
      : !this.state.hasCompletedOnce && this.state.started && !this.state.completed
        ? 'resume'
        : 'start';
    const label = hasNewSteps
      ? interpolate(
          newSteps.length === 1 ? this.strings.trigger.viewNewTip : this.strings.trigger.viewNewTips,
          { count: newSteps.length }
        )
      : state === 'resume'
        ? this.strings.trigger.resume
        : this.strings.trigger.start;

    buttons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      button.disabled = false;
      button.removeAttribute('aria-hidden');
      button.removeAttribute('title');
      button.setAttribute('aria-label', label);
      button.setAttribute('data-tour-state', state);
      button.setAttribute(
        'data-tour-badge',
        hasNewSteps && newSteps.length > 1 ? String(newSteps.length) : ''
      );
      button.setAttribute(
        'data-tour-badge-mode',
        hasNewSteps && newSteps.length === 1 ? 'dot' : hasNewSteps ? 'count' : 'none'
      );
    });
  }

  private saveState(): void {
    localStorage.setItem(SITE_TOUR_STORAGE_KEY, JSON.stringify(this.state));
  }

  private hasSeenStep(stepId: SiteTourStepId): boolean {
    return this.state.seenStepIds.includes(stepId);
  }

  private hasSeenAnySteps(): boolean {
    return this.state.seenStepIds.length > 0;
  }

  private markStepSeen(stepId: SiteTourStepId): void {
    if (!this.state.seenStepIds.includes(stepId)) {
      this.state.seenStepIds.push(stepId);
      this.saveState();
    }
  }

  private isClickOnCurrentTarget(element: Element): boolean {
    if (!this.isOpen) {
      return false;
    }

    const step = this.getCurrentStep();
    if (!step) {
      return false;
    }

    const target = this.resolveTarget(step);
    return target instanceof Element ? target.contains(element) : false;
  }

  private start(scrollIntoView: boolean): void {
    this.singleStepMode = false;
    this.stepFilterMode = 'all';
    this.singleStepId = null;
    this.state.started = true;
    this.state.completed = false;
    this.state.currentStepId = this.stepDefinitions[0]?.id ?? SITE_TOUR_STEP_ORDER[0];
    this.saveState();
    this.openAt(this.resolveStoredIndex(), scrollIntoView);
  }

  private resume(): void {
    this.singleStepMode = false;
    this.stepFilterMode = 'all';
    this.singleStepId = null;
    this.openAt(this.resolveStoredIndex(), true);
  }

  private openNew(): void {
    const newSteps = this.getNewSteps();
    if (newSteps.length === 0) {
      this.restart();
      return;
    }

    this.singleStepMode = false;
    this.stepFilterMode = 'new';
    this.singleStepId = null;
    if (!this.state.started) {
      this.state.started = true;
      this.saveState();
    }
    this.openAt(0, true);
  }

  private restart(): void {
    this.singleStepMode = false;
    this.stepFilterMode = 'all';
    this.singleStepId = null;
    this.state.started = true;
    this.state.completed = false;
    this.state.currentStepId = this.stepDefinitions[0]?.id ?? SITE_TOUR_STEP_ORDER[0];
    this.saveState();
    this.openAt(0, true);
  }

  private openAt(index: number, scrollIntoView: boolean): void {
    this.steps = this.buildSteps();
    if (this.steps.length === 0 || !this.root) {
      this.clearPendingPaintLock();
      return;
    }

    this.activeStepIds = this.steps.map((step) => step.id);
    this.lastFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.isOpen = true;
    this.root.hidden = false;
    this.root.dataset.modalOpen = 'false';
    this.currentIndex = clamp(index, 0, this.steps.length - 1);
    if (!this.singleStepMode) {
      const currentStep = this.getCurrentStep();
      if (currentStep) {
        this.state.currentStepId = currentStep.id;
        this.saveState();
      }
    }
    this.syncHelpButtons();
    this.render(scrollIntoView);
    this.clearPendingPaintLock();
  }

  private close(keepProgress: boolean): void {
    this.isOpen = false;
    this.clearPendingRenderTimers();
    this.clearPendingPaintLock();
    this.releaseManagedFocusTarget();
    if (this.root) {
      this.root.dataset.modalOpen = 'false';
    }
    if (keepProgress) {
      const currentStep = this.getCurrentStep();
      if (currentStep && !this.singleStepMode) {
        this.state.currentStepId = currentStep.id;
        this.saveState();
      }
    }
    if (this.root) {
      this.root.hidden = true;
    }
    this.stepFilterMode = 'all';
    this.activeStepIds = null;
    this.singleStepId = null;
    this.singleStepMode = false;
    this.lastRenderedStepId = null;
    this.restoreFocus();
    this.restoreSuppressedTooltips();
  }

  private complete(): void {
    this.state.hasCompletedOnce = true;
    this.state.completed = true;
    this.state.currentStepId = this.stepDefinitions[0]?.id ?? SITE_TOUR_STEP_ORDER[0];
    this.saveState();
    this.close(false);
    this.syncHelpButtons();
  }

  private getCurrentStep(): SiteTourStepDefinition | null {
    return this.steps[this.currentIndex] ?? null;
  }

  private resolveStoredIndex(): number {
    return resolveStoredStepIndex(this.steps, this.state.currentStepId);
  }

  private resolveTarget(step: SiteTourStepDefinition): HTMLElement | null {
    for (const selector of step.selectors) {
      const matches = document.querySelectorAll(selector);
      for (const match of matches) {
        if (isUsableTarget(match)) {
          return match;
        }
      }
    }

    return null;
  }

  private getTopicsDropdown(): Element | null {
    return document.querySelector('[data-tour-target="topics-dropdown"]');
  }

  private isTopicsDropdownOpen(): boolean {
    const dropdown = this.getTopicsDropdown();
    if (!(dropdown instanceof HTMLElement)) {
      return false;
    }

    return (
      dropdown.dataset.open === 'true' ||
      dropdown.querySelector('[data-dropdown-trigger]')?.getAttribute('aria-expanded') === 'true'
    );
  }

  private getHighlightRect(step: SiteTourStepDefinition, target: HTMLElement): HighlightRect {
    const rect = target.getBoundingClientRect();

    if (step.id === 'topics-dropdown') {
      const dropdown = this.getTopicsDropdown();
      const trigger =
        target.matches('[data-dropdown-trigger]')
          ? target
          : dropdown?.querySelector('[data-dropdown-trigger]');
      const triggerRect = trigger instanceof HTMLElement ? trigger.getBoundingClientRect() : rect;

      if (!this.isTopicsDropdownOpen()) {
        return {
          top: triggerRect.top,
          left: triggerRect.left,
          right: triggerRect.right,
          bottom: triggerRect.bottom,
          width: triggerRect.width,
          height: triggerRect.height,
        };
      }

      const panel = dropdown?.querySelector('[data-dropdown-panel]:not([hidden])');
      if (panel instanceof HTMLElement) {
        const panelRect = panel.getBoundingClientRect();
        return {
          top: Math.min(triggerRect.top, panelRect.top),
          left: Math.min(triggerRect.left, panelRect.left),
          right: Math.max(triggerRect.right, panelRect.right),
          bottom: Math.max(triggerRect.bottom, panelRect.bottom),
          width:
            Math.max(triggerRect.right, panelRect.right) -
            Math.min(triggerRect.left, panelRect.left),
          height:
            Math.max(triggerRect.bottom, panelRect.bottom) -
            Math.min(triggerRect.top, panelRect.top),
        };
      }

      return {
        top: triggerRect.top,
        left: triggerRect.left,
        right: triggerRect.right,
        bottom: triggerRect.bottom,
        width: triggerRect.width,
        height: triggerRect.height,
      };
    }

    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }

  private clearPendingRenderTimers(): void {
    for (const timer of this.pendingRenderTimers) {
      window.clearTimeout(timer);
    }

    this.pendingRenderTimers = [];
  }

  private scheduleRefreshRetry(): void {
    if (this.refreshRetryTimer !== null || this.refreshRetryCount >= 5) {
      return;
    }

    this.refreshRetryCount += 1;
    this.refreshRetryTimer = window.setTimeout(() => {
      this.refreshRetryTimer = null;
      this.refresh();
    }, 150);
  }

  private clearRefreshRetry(): void {
    if (this.refreshRetryTimer !== null) {
      window.clearTimeout(this.refreshRetryTimer);
      this.refreshRetryTimer = null;
    }

    this.refreshRetryCount = 0;
  }

  private advance(): void {
    const currentStepId = this.getCurrentStep()?.id ?? this.state.currentStepId;
    if (!this.refreshActiveSteps(currentStepId)) {
      this.close(false);
      return;
    }

    const step = this.getCurrentStep();
    if (!step) {
      return;
    }

    if (!this.singleStepMode) {
      this.markStepSeen(step.id);
    }

    if (this.currentIndex >= this.steps.length - 1) {
      if (this.singleStepMode) {
        this.close(false);
        this.syncHelpButtons();
        return;
      }

      this.complete();
      return;
    }

    this.markCurrentStepSeen();
    this.goToIndex(this.currentIndex + 1, true);
  }

  private goBack(): void {
    const currentStepId = this.getCurrentStep()?.id ?? this.state.currentStepId;
    if (!this.refreshActiveSteps(currentStepId)) {
      this.close(false);
      return;
    }

    if (this.singleStepMode || this.currentIndex <= 0) {
      return;
    }

    this.markCurrentStepSeen();
    this.goToIndex(this.currentIndex - 1, true);
  }

  private jumpTo(index: number): void {
    const currentStepId = this.getCurrentStep()?.id ?? this.state.currentStepId;
    if (!this.refreshActiveSteps(currentStepId)) {
      this.close(false);
      return;
    }

    if (this.singleStepMode || this.steps.length === 0) {
      return;
    }

    const targetIndex = clamp(index, 0, this.steps.length - 1);
    if (targetIndex === this.currentIndex) {
      this.render(false);
      return;
    }

    this.markCurrentStepSeen();
    this.goToIndex(targetIndex, true);
  }

  private markCurrentStepSeen(): void {
    if (this.singleStepMode) {
      return;
    }

    const currentStep = this.getCurrentStep();
    if (currentStep) {
      this.markStepSeen(currentStep.id);
    }
  }

  private goToIndex(index: number, scrollIntoView: boolean): void {
    if (this.steps.length === 0) {
      return;
    }

    this.currentIndex = clamp(index, 0, this.steps.length - 1);
    if (!this.singleStepMode) {
      const currentStep = this.getCurrentStep();
      if (currentStep) {
        this.state.currentStepId = currentStep.id;
        this.saveState();
      }
    }

    this.render(scrollIntoView);
  }

  private scheduleRender(): void {
    if (!this.isOpen || !this.root || this.root.hidden) {
      return;
    }

    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
    }

    this.renderFrame = requestAnimationFrame(() => this.render(false));
  }

  private render(scrollIntoView: boolean): void {
    if (
      !this.title ||
      !this.body ||
      !this.progress ||
      !this.previousButton ||
      !this.nextButton ||
      !this.restartButton ||
      !this.stepNav ||
      !this.hint
    ) {
      return;
    }

    const currentStepId = this.getCurrentStep()?.id ?? this.state.currentStepId;
    if (!this.refreshActiveSteps(currentStepId)) {
      this.close(false);
      return;
    }

    const step = this.getCurrentStep();
    if (!step) {
      this.close(false);
      return;
    }

    const target = this.resolveTarget(step);

    if (!target) {
      if (this.singleStepMode) {
        this.close(false);
        return;
      }

      this.steps = this.buildSteps();
      if (this.steps.length === 0) {
        this.close(false);
        return;
      }

      this.currentIndex = clamp(this.resolveStoredIndex(), 0, this.steps.length - 1);
      this.render(scrollIntoView);
      return;
    }

    if (scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      this.clearPendingRenderTimers();
      const timer = window.setTimeout(() => this.scheduleRender(), 220);
      this.pendingRenderTimers.push(timer);
    }

    this.title.textContent = step.title;
    this.body.textContent = step.body;
    this.progress.textContent = this.singleStepMode
      ? this.strings.quickTip
      : interpolate(this.strings.progress, {
          current: this.currentIndex + 1,
          total: this.steps.length,
        });
    this.renderStepNav();
    this.previousButton.hidden = this.singleStepMode;
    this.previousButton.disabled = this.singleStepMode || this.currentIndex === 0;
    this.previousButton.setAttribute(
      'title',
      this.currentIndex > 0
        ? interpolate(this.strings.tooltips.previous, {
            title: this.steps[this.currentIndex - 1].title,
          })
        : this.strings.tooltips.firstStep
    );
    this.previousButton.setAttribute(
      'aria-label',
      this.currentIndex > 0
        ? interpolate(this.strings.tooltips.previous, {
            title: this.steps[this.currentIndex - 1].title,
          })
        : this.strings.tooltips.firstStep
    );
    this.nextButton.innerHTML = this.getNextButtonMarkup(
      this.singleStepMode
        ? this.strings.labels.close
        : this.currentIndex === this.steps.length - 1
          ? this.strings.labels.finish
          : this.strings.labels.next
    );
    this.nextButton.setAttribute(
      'title',
      this.singleStepMode
        ? this.strings.tooltips.closeQuickTip
        : this.currentIndex === this.steps.length - 1
          ? this.strings.tooltips.finish
          : interpolate(this.strings.tooltips.next, {
              title: this.steps[this.currentIndex + 1].title,
            })
    );
    this.nextButton.setAttribute(
      'aria-label',
      this.singleStepMode
        ? this.strings.tooltips.closeQuickTip
        : this.currentIndex === this.steps.length - 1
          ? this.strings.tooltips.finish
          : interpolate(this.strings.tooltips.next, {
              title: this.steps[this.currentIndex + 1].title,
            })
    );
    this.nextButton.disabled = false;
    this.restartButton.hidden = this.singleStepMode;
    this.restartButton.setAttribute('title', this.strings.tooltips.restart);
    this.restartButton.setAttribute('aria-label', this.strings.tooltips.restart);
    this.syncHelpButtons();

    if (step.id === 'scroll-to-top') {
      this.hint.hidden = false;
      this.hint.textContent = this.strings.hint.scrollToTop;
    } else {
      this.hint.hidden = true;
      this.hint.textContent = '';
    }

    const rawRect = this.getHighlightRect(step, target);
    const padding = getStepHighlightPadding(step.id);
    const hole = {
      top: clamp(rawRect.top - padding, 0, window.innerHeight),
      left: clamp(rawRect.left - padding, 0, window.innerWidth),
      width: clamp(rawRect.width + padding * 2, 0, window.innerWidth),
      height: clamp(rawRect.height + padding * 2, 0, window.innerHeight),
    };
    const highlight = {
      ...hole,
      right: clamp(hole.left + hole.width, 0, window.innerWidth),
      bottom: clamp(hole.top + hole.height, 0, window.innerHeight),
    };

    this.updateSuppressedTooltips(target);

    const shouldMoveFocus =
      step.id !== this.lastRenderedStepId || !this.isFocusWithinCurrentStep(target);

    this.positionBackdrop(highlight);
    this.positionSpotlight(highlight);
    this.positionCard(highlight);
    this.lastRenderedStepId = step.id;

    if (shouldMoveFocus) {
      this.focusCurrentStep(target);
    }
  }

  private focusCurrentStep(target: HTMLElement): void {
    const focusTarget = this.getTargetFocusables(target)[0] ?? this.closeButton ?? this.nextButton;

    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  private updateSuppressedTooltips(target: HTMLElement): void {
    this.restoreSuppressedTooltips();

    for (const element of this.getTargetFocusables(target)) {
      this.suppressTooltip(element as TooltipElement);
    }
  }

  private suppressTooltip(element: TooltipElement): void {
    if (!(element instanceof HTMLElement) || this.suppressedTooltipState.has(element)) {
      return;
    }

    const tippy = element._tippy;
    this.suppressedTooltipState.set(element, {
      hadTitle: element.hasAttribute('title'),
      title: element.getAttribute('title'),
      tippy,
      tippyWasEnabled: Boolean(tippy && tippy.state?.isEnabled !== false),
    });

    if (element.hasAttribute('title')) {
      element.removeAttribute('title');
    }

    if (tippy) {
      tippy.hide();
      if (tippy.state?.isEnabled !== false) {
        tippy.disable();
      }
    }
  }

  private restoreSuppressedTooltip(element: TooltipElement): void {
    const suppressedState = this.suppressedTooltipState.get(element);
    if (!suppressedState) {
      return;
    }

    if (suppressedState.hadTitle && suppressedState.title !== null) {
      element.setAttribute('title', suppressedState.title);
    } else {
      element.removeAttribute('title');
    }

    if (suppressedState.tippy && suppressedState.tippyWasEnabled) {
      suppressedState.tippy.enable();
    }

    this.suppressedTooltipState.delete(element);
  }

  private restoreSuppressedTooltips(): void {
    for (const element of [...this.suppressedTooltipState.keys()]) {
      this.restoreSuppressedTooltip(element);
    }
  }

  private renderStepNav(): void {
    if (!this.stepNav) {
      return;
    }

    const showStepNav = !this.singleStepMode && this.steps.length > 1;
    this.stepNav.hidden = !showStepNav;

    if (!showStepNav) {
      this.stepNav.innerHTML = '';
      return;
    }

    this.stepNav.innerHTML = this.steps
      .map((step, index) => {
        const isCurrent = index === this.currentIndex;
        const title = isCurrent
          ? interpolate(this.strings.tooltips.currentStep, { title: step.title })
          : interpolate(this.strings.tooltips.jumpToStep, { title: step.title });
        return `<button type="button" class="aspire-site-tour-step-dot" data-tour-step-index="${index}" aria-label="${escapeHtml(title)}"${isCurrent ? ' aria-current="step"' : ''}></button>`;
      })
      .join('');
  }

  private getTargetFocusables(target: HTMLElement | null): HTMLElement[] {
    if (!isUsableTarget(target)) {
      return [];
    }

    const focusables: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    const nestedFocusableElements: HTMLElement[] = [];
    const push = (element: HTMLElement | null): void => {
      if (!(element instanceof HTMLElement) || seen.has(element) || !isUsableTarget(element)) {
        return;
      }

      seen.add(element);
      focusables.push(element);
    };

    target
      .querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex], [contenteditable="true"]'
      )
      .forEach((element) => {
        if (!(element instanceof HTMLElement)) {
          return;
        }

        if (element.getAttribute('tabindex') === '-1' && element !== this.managedFocusTarget) {
          return;
        }

        if (!this.isFocusable(element)) {
          return;
        }

        nestedFocusableElements.push(element);
      });

    if (this.isFocusable(target)) {
      push(target);
    } else if (nestedFocusableElements.length === 0) {
      push(this.makeTemporarilyFocusable(target));
    } else {
      this.releaseManagedFocusTarget();
    }

    nestedFocusableElements.forEach((element) => push(element));

    return focusables;
  }

  private getCardFocusables(): HTMLElement[] {
    const stepButtons = this.stepNav
      ? Array.from(this.stepNav.querySelectorAll('[data-tour-step-index]'))
      : [];

    return [
      this.closeButton,
      ...stepButtons,
      this.previousButton,
      this.restartButton,
      this.nextButton,
    ].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && !element.hidden && !(element instanceof HTMLButtonElement && element.disabled)
    );
  }

  private getFocusSequence(): HTMLElement[] {
    const step = this.getCurrentStep();
    const target = step ? this.resolveTarget(step) : null;
    return [...this.getTargetFocusables(target), ...this.getCardFocusables()];
  }

  private isFocusWithinCurrentStep(target: HTMLElement): boolean {
    const focusSequence = [...this.getTargetFocusables(target), ...this.getCardFocusables()];
    return focusSequence.includes(document.activeElement as HTMLElement);
  }

  private handleTabKey(event: KeyboardEvent): void {
    const focusSequence = this.getFocusSequence();
    if (focusSequence.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = focusSequence.findIndex((element) => element === document.activeElement);
    const fallbackIndex = event.shiftKey ? 0 : -1;
    const baseIndex = currentIndex === -1 ? fallbackIndex : currentIndex;
    const nextIndex =
      (baseIndex + (event.shiftKey ? -1 : 1) + focusSequence.length) % focusSequence.length;
    focusSequence[nextIndex]?.focus({ preventScroll: true });
  }

  private isFocusable(element: HTMLElement): boolean {
    if (element.hidden) {
      return false;
    }

    if (element.matches('[disabled], [aria-disabled="true"]')) {
      return false;
    }

    const tagName = element.tagName;
    if (tagName === 'A') {
      return element.hasAttribute('href') || element.tabIndex >= 0;
    }

    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(tagName)) {
      return true;
    }

    return element.tabIndex >= 0 || element.getAttribute('contenteditable') === 'true';
  }

  private makeTemporarilyFocusable(element: HTMLElement): HTMLElement {
    if (this.managedFocusTarget === element) {
      return element;
    }

    this.releaseManagedFocusTarget();

    element.dataset.tourManagedFocus = 'true';
    if (element.hasAttribute('tabindex')) {
      element.dataset.tourManagedTabindex = element.getAttribute('tabindex') ?? '';
    }
    element.setAttribute('tabindex', '-1');
    this.managedFocusTarget = element;
    return element;
  }

  private releaseManagedFocusTarget(): void {
    if (!(this.managedFocusTarget instanceof HTMLElement)) {
      this.managedFocusTarget = null;
      return;
    }

    const target = this.managedFocusTarget;
    const previousTabindex = target.dataset.tourManagedTabindex;
    if (previousTabindex === undefined) {
      target.removeAttribute('tabindex');
    } else {
      target.setAttribute('tabindex', previousTabindex);
      delete target.dataset.tourManagedTabindex;
    }

    delete target.dataset.tourManagedFocus;
    this.managedFocusTarget = null;
  }

  private restoreFocus(): void {
    const candidate = this.lastFocusedElement;
    this.lastFocusedElement = null;

    if (!(candidate instanceof HTMLElement) || !document.contains(candidate) || !isUsableTarget(candidate)) {
      return;
    }

    const tooltipCandidate = candidate as TooltipElement;
    const shouldRestoreTooltip = !this.suppressedTooltipState.has(tooltipCandidate);
    if (shouldRestoreTooltip) {
      this.suppressTooltip(tooltipCandidate);
    }

    candidate.focus({ preventScroll: true });

    if (shouldRestoreTooltip) {
      this.restoreSuppressedTooltip(tooltipCandidate);
    }
  }

  private positionBackdrop(hole: HighlightRect): void {
    if (!this.segments) {
      return;
    }

    Object.assign(this.segments.top.style, {
      top: '0px',
      left: '0px',
      width: '100vw',
      height: `${hole.top}px`,
    });
    Object.assign(this.segments.left.style, {
      top: `${hole.top}px`,
      left: '0px',
      width: `${hole.left}px`,
      height: `${hole.height}px`,
    });
    Object.assign(this.segments.right.style, {
      top: `${hole.top}px`,
      left: `${hole.right}px`,
      width: `${Math.max(window.innerWidth - hole.right, 0)}px`,
      height: `${hole.height}px`,
    });
    Object.assign(this.segments.bottom.style, {
      top: `${hole.bottom}px`,
      left: '0px',
      width: '100vw',
      height: `${Math.max(window.innerHeight - hole.bottom, 0)}px`,
    });
  }

  private positionSpotlight(hole: HighlightRect): void {
    if (!this.spotlight) {
      return;
    }

    Object.assign(this.spotlight.style, {
      top: `${hole.top}px`,
      left: `${hole.left}px`,
      width: `${hole.width}px`,
      height: `${hole.height}px`,
    });
  }

  private positionCard(hole: HighlightRect): void {
    if (!this.card) {
      return;
    }

    const margin = 16;
    const cardRect = this.card.getBoundingClientRect();
    const isCompactViewport = window.innerWidth <= 768;

    if (isCompactViewport) {
      const left = clamp(
        (window.innerWidth - cardRect.width) / 2,
        8,
        window.innerWidth - cardRect.width - 8
      );
      const top = clamp(
        window.innerHeight - cardRect.height - 8,
        8,
        window.innerHeight - cardRect.height - 8
      );

      Object.assign(this.card.style, {
        left: `${left}px`,
        top: `${top}px`,
      });
      return;
    }

    const fitsRight = window.innerWidth - hole.right >= cardRect.width + margin;
    const fitsLeft = hole.left >= cardRect.width + margin;
    const fitsBottom = window.innerHeight - hole.bottom >= cardRect.height + margin;

    let left: number;
    let top: number;

    if (fitsRight) {
      left = hole.right + margin;
      top = clamp(hole.top, margin, window.innerHeight - cardRect.height - margin);
    } else if (fitsLeft) {
      left = hole.left - cardRect.width - margin;
      top = clamp(hole.top, margin, window.innerHeight - cardRect.height - margin);
    } else if (fitsBottom) {
      left = clamp(hole.left, margin, window.innerWidth - cardRect.width - margin);
      top = hole.bottom + margin;
    } else {
      left = clamp(hole.left, margin, window.innerWidth - cardRect.width - margin);
      top = clamp(
        hole.top - cardRect.height - margin,
        margin,
        window.innerHeight - cardRect.height - margin
      );
    }

    Object.assign(this.card.style, {
      left: `${left}px`,
      top: `${top}px`,
    });
  }

  private getNextButtonMarkup(label: string): string {
    return `<span class="aspire-site-tour-btn-label">${escapeHtml(label)}</span><span class="aspire-site-tour-btn-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10" /><path d="m9 4l4 4l-4 4" /></svg></span>`;
  }
}

export function bootstrapAspireSiteTour(strings: SiteTourStrings): AspireSiteTour | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  if (window.__aspireSiteTour) {
    window.__aspireSiteTour.refresh();
    return window.__aspireSiteTour;
  }

  const siteTour = new AspireSiteTour(strings);
  window.__aspireSiteTour = siteTour;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => siteTour.init(), { once: true });
  } else {
    siteTour.init();
  }

  return siteTour;
}