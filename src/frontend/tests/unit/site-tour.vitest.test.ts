import { describe, expect, it } from 'vitest';

import {
  SITE_TOUR_STEP_ORDER,
  createSiteTourStepDefinitions,
  filterStepDefinitions,
  getDefaultSiteTourState,
  getStepHighlightPadding,
  isLandingPath,
  parseSiteTourState,
  resolveStoredStepIndex,
  type SiteTourStrings,
} from '@components/site-tour';

const siteTourStrings: SiteTourStrings = {
  eyebrow: 'Site tour',
  quickTip: 'Quick tip',
  progress: '{{current}} of {{total}}',
  unavailable: 'Site tour is available on larger screens',
  labels: {
    dismiss: 'Dismiss site tour',
    previous: 'Previous',
    restart: 'Start over',
    next: 'Next',
    finish: 'Finish',
    close: 'Close',
  },
  trigger: {
    viewNewTip: 'View {{count}} new tour tip',
    viewNewTips: 'View {{count}} new tour tips',
    resume: 'Resume site tour',
    start: 'Start site tour',
  },
  tooltips: {
    restart: 'Start the site tour over from the beginning',
    closeQuickTip: 'Close quick tip',
    finish: 'Finish site tour',
    previous: 'Go to previous step: {{title}}',
    next: 'Go to next step: {{title}}',
    firstStep: 'You are on the first step',
    currentStep: 'Current step: {{title}}',
    jumpToStep: 'Jump to {{title}}',
  },
  hint: {
    scrollToTop: 'Click the highlighted button to return to the top and close the tour.',
  },
  steps: {
    sidebarToggle: { title: 'Show or hide the sidebar', body: 'Sidebar body' },
    topicsDropdown: { title: 'Jump to another doc area', body: 'Topics body' },
    search: { title: 'Search the docs', body: 'Search body' },
    installCli: { title: 'View CLI install commands', body: 'Install body' },
    cookiePreferences: { title: 'Manage cookie consent', body: 'Cookie body' },
    tourHelp: { title: 'Reopen the tour', body: 'Help body' },
    pageActions: { title: 'Use page actions', body: 'Actions body' },
    pivotSelector: { title: 'Switch code examples', body: 'Pivot body' },
    editPage: { title: 'Edit this page on GitHub', body: 'Edit body' },
    footerPreferences: { title: 'Change site preferences', body: 'Footer body' },
    scrollToTop: { title: 'Back to top', body: 'Scroll body' },
  },
};

describe('site tour helpers', () => {
  it('creates step definitions in the canonical order', () => {
    expect(createSiteTourStepDefinitions(siteTourStrings).map((step) => step.id)).toEqual(
      SITE_TOUR_STEP_ORDER
    );
  });

  it('parses stored state and filters invalid step ids', () => {
    const state = parseSiteTourState(
      JSON.stringify({
        started: true,
        completed: true,
        currentStepId: 'search',
        seenStepIds: ['search', 'pivot-selector', 'not-a-step'],
      })
    );

    expect(state).toEqual({
      started: true,
      completed: true,
      hasCompletedOnce: false,
      currentStepId: 'search',
      seenStepIds: ['search', 'pivot-selector'],
    });
  });

  it('falls back to defaults when stored state is malformed', () => {
    expect(parseSiteTourState('{bad-json')).toEqual(getDefaultSiteTourState());
  });

  it('filters unseen and single-step views correctly', () => {
    const steps = createSiteTourStepDefinitions(siteTourStrings).slice(0, 4);

    expect(filterStepDefinitions(steps, ['search'], 'new', null).map((step) => step.id)).toEqual([
      'sidebar-toggle',
      'topics-dropdown',
      'install-cli',
    ]);
    expect(
      filterStepDefinitions(steps, [], 'single', 'topics-dropdown').map((step) => step.id)
    ).toEqual(['topics-dropdown']);
  });

  it('resolves the nearest next available step when the stored step is missing', () => {
    const steps = [{ id: 'search' }, { id: 'edit-page' }];

    expect(resolveStoredStepIndex(steps, 'search')).toBe(0);
    expect(resolveStoredStepIndex(steps, 'topics-dropdown')).toBe(0);
    expect(resolveStoredStepIndex(steps, 'footer-preferences')).toBe(1);
    expect(resolveStoredStepIndex(steps, 'unknown-step')).toBe(0);
  });

  it('detects landing paths and special search padding', () => {
    expect(isLandingPath('/')).toBe(true);
    expect(isLandingPath('/en/')).toBe(true);
    expect(isLandingPath('/docs/get-started/')).toBe(false);
    expect(getStepHighlightPadding('search')).toBe(2);
    expect(getStepHighlightPadding('sidebar-toggle')).toBe(12);
  });
});