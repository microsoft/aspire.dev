// Ported from src/frontend/src/components/SessionGrid.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// Conference date for timezone conversion (March 23, 2026)
const CONF_DATE = '2026-03-23';
let cleanupSessionGrid: (() => void) | undefined;

function initSessionGrid() {
  cleanupSessionGrid?.();
  const controls = document.querySelector<HTMLElement>('.session-controls');
  if (!controls) return;
  const controller = new AbortController();
  const { signal } = controller;
  const animations = new Set<Animation>();
  cleanupSessionGrid = () => {
    controller.abort();
    animations.forEach((animation) => animation.cancel());
  };
  // ── Collapsible time groups ──
  const groups = document.querySelectorAll<HTMLDetailsElement>('.time-group');

  for (const details of groups) {
    const summary = details.querySelector('summary');
    const wrapper = details.querySelector<HTMLElement>('.session-list-wrapper');
    if (!summary || !wrapper) continue;

    let animation: Animation | null = null;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (animation) animations.delete(animation);
      animation?.cancel();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        details.open = !details.open;
        return;
      }

      if (details.open) {
        const startHeight = wrapper.offsetHeight;
        wrapper.style.overflow = 'hidden';
        animation = wrapper.animate(
          [
            { height: `${startHeight}px`, opacity: 1 },
            { height: '0px', opacity: 0 },
          ],
          { duration: 250, easing: 'ease-in-out' }
        );
        animation.onfinish = () => {
          if (animation) animations.delete(animation);
          details.open = false;
          wrapper.style.overflow = '';
          wrapper.style.height = '';
          animation = null;
        };
      } else {
        details.open = true;
        const endHeight = wrapper.offsetHeight;
        wrapper.style.overflow = 'hidden';
        animation = wrapper.animate(
          [
            { height: '0px', opacity: 0 },
            { height: `${endHeight}px`, opacity: 1 },
          ],
          { duration: 250, easing: 'ease-in-out' }
        );
        animation.onfinish = () => {
          if (animation) animations.delete(animation);
          wrapper.style.overflow = '';
          wrapper.style.height = '';
          animation = null;
        };
      }
      if (animation) animations.add(animation);
    }, { signal });
  }

  // ── Filter state ──
  const searchInput = document.querySelector<HTMLInputElement>('.session-search');
  const clearSearchBtn = document.querySelector<HTMLButtonElement>('.clear-search');
  const tzBtn = document.querySelector<HTMLButtonElement>('.tz-toggle');
  const tzLabel = tzBtn?.querySelector<HTMLSpanElement>('.tz-label');
  const clockBtn = document.querySelector<HTMLButtonElement>('.clock-toggle');
  const clockLabel = clockBtn?.querySelector<HTMLSpanElement>('.clock-label');
  const filterSummary = document.querySelector<HTMLSpanElement>('.filter-summary');
  const emptyState = controls.querySelector<HTMLElement>('.no-results-msg');
  const cards = document.querySelectorAll<HTMLElement>('.session-card');

  let searchQuery = '';

  // The clock and timezone choices last for the tab's session: each page load runs this script again, so they are
  // kept in sessionStorage (the Astro build kept them in memory across its client-side navigations).
  const prefKeys = { localTime: 'aspireconf-show-local-time', hour12: 'aspireconf-hour12' } as const;
  function readPref(key: string): boolean | undefined {
    try {
      const value = sessionStorage.getItem(key);
      return value === null ? undefined : value === 'true';
    } catch {
      return undefined;
    }
  }
  function writePref(key: string, value: boolean) {
    try {
      sessionStorage.setItem(key, String(value));
    } catch {
      // Storage unavailable (private mode, blocked): the choice lasts for this page only.
    }
  }

  let showLocalTime = readPref(prefKeys.localTime) ?? true;

  // Detect browser's preferred hour cycle
  function detectBrowserHour12(): boolean {
    const testFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
    const resolved = testFormatter.resolvedOptions();
    return resolved.hour12 ?? !resolved.hourCycle?.startsWith('h2');
  }
  let useHour12 = readPref(prefKeys.hour12) ?? detectBrowserHour12();

  // ── Timezone conversion ──
  function parsePTTime(ptStr: string): Date | null {
    // Parse "9:00 AM PT" or "9:35 AM PT" → Date on conf day in PT
    const match = ptStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*PT/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    // Build a Date in PT (America/Los_Angeles)
    // March 23, 2026 is in PDT (UTC-7)
    const dateStr = `${CONF_DATE}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

    // Create as a Date using the known PT offset
    // We'll use Intl to resolve the actual offset
    const tempDate = new Date(dateStr);
    // Get the PT offset for this date
    const ptFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    // Create a UTC date that represents this PT time
    const utcDate = new Date(`${CONF_DATE}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-07:00`);
    return utcDate;
  }

  function formatLocalTime(date: Date): string {
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTz,
      hour: useHour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12: useHour12,
      timeZoneName: 'short',
    });
    return formatter.format(date);
  }

  function formatPTTime(ptStr: string): string {
    // Reformat the original PT time string according to current hour format
    const match = ptStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*PT/i);
    if (!match) return ptStr;
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3].toUpperCase();
    if (useHour12) {
      return `${hours}:${minutes} ${period} PT`;
    } else {
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${minutes} PT`;
    }
  }

  function getUserTzAbbr(): string {
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTz,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date(`${CONF_DATE}T12:00:00-07:00`));
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart?.value || 'Local';
  }

  function updateTimezoneDisplay() {
    const timeLabels = document.querySelectorAll<HTMLElement>('[data-original-time]');
    for (const el of timeLabels) {
      const original = el.getAttribute('data-original-time')!;
      if (showLocalTime) {
        const date = parsePTTime(original);
        if (date) {
          el.textContent = formatLocalTime(date);
        }
      } else {
        el.textContent = formatPTTime(original);
      }
    }

    // Update collapsed-info pills to also reflect counts
    updateGroupVisibility();
  }

  // ── Filtering ──
  function applyFilters() {
    let visibleCount = 0;
    const totalCount = cards.length;

    for (const card of cards) {
      const title = card.getAttribute('data-title') || '';
      const speakers = card.getAttribute('data-speakers') || '';
      const abstract = card.getAttribute('data-abstract') || '';

      let visible = true;

      // Text search
      if (searchQuery) {
        const haystack = `${title} ${speakers} ${abstract}`;
        visible = haystack.includes(searchQuery);
      }

      if (visible) {
        card.classList.remove('filtered-out');
        visibleCount++;
      } else {
        card.classList.add('filtered-out');
      }
    }

    updateGroupVisibility();
    updateFilterStatus(visibleCount, totalCount);
    if (visibleCount === 0 && totalCount > 0 && emptyState) {
      const queryText = emptyState.querySelector<HTMLElement>('.search-empty-query')!;
      queryText.textContent = emptyState.dataset.queryLabel!
        .replace('{{query}}', () => searchInput?.value.trim() ?? '');
      queryText.hidden = !searchQuery;
    }
  }

  function updateGroupVisibility() {
    for (const group of groups) {
      const visibleCards = group.querySelectorAll('.session-card:not(.filtered-out)');

      if (visibleCards.length === 0) {
        group.classList.add('group-hidden');
      } else {
        group.classList.remove('group-hidden');
      }

      // Update collapsed-info pill count
      const pill = group.querySelector('.collapsed-info');
      if (pill) {
        const count = visibleCards.length;
        pill.textContent = `${count} ${count === 1 ? 'session' : 'sessions'}`;
      }
    }

    if (emptyState) emptyState.hidden = [...cards].some((card) => !card.classList.contains('filtered-out'));
  }

  function updateFilterStatus(visible: number, total: number) {
    if (filterSummary) filterSummary.textContent = (controls?.dataset.countTemplate ?? '')
      .replace('{{count}}', String(visible)).replace('{{total}}', String(total));
  }

  // ── Event listeners ──
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    if (clearSearchBtn) {
      clearSearchBtn.hidden = !searchQuery;
    }
    applyFilters();
  }, { signal });

  function clearSearch() {
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.hidden = true;
    searchInput?.focus();
    applyFilters();
  }
  clearSearchBtn?.addEventListener('click', clearSearch, { signal });
  controls.querySelector('[data-session-recover]')?.addEventListener('click', clearSearch, { signal });
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') clearSearch();
  }, { signal });

  function setTooltip(el: HTMLElement, text: string) {
    const tippy = (el as any)._tippy;
    if (tippy) {
      tippy.setContent(text);
    } else {
      el.title = text;
    }
  }

  function updateTzTitle() {
    if (!tzBtn) return;
    if (showLocalTime) {
      const abbr = getUserTzAbbr();
      setTooltip(tzBtn, `Currently showing ${abbr} \u2014 click to switch to PT`);
    } else {
      const abbr = getUserTzAbbr();
      setTooltip(tzBtn, `Currently showing PT \u2014 click to switch to ${abbr}`);
    }
  }

  tzBtn?.addEventListener('click', () => {
    showLocalTime = !showLocalTime;
    writePref(prefKeys.localTime, showLocalTime);
    tzBtn.setAttribute('data-active', String(showLocalTime));

    if (tzLabel) {
      if (showLocalTime) {
        const abbr = getUserTzAbbr();
        tzLabel.textContent = `Showing ${abbr}`;
      } else {
        tzLabel.textContent = 'Show local time';
      }
    }

    updateTzTitle();
    updateTimezoneDisplay();
  }, { signal });

  // ── Clock format toggle ──
  function updateClockTitle() {
    if (!clockBtn) return;
    if (useHour12) {
      setTooltip(clockBtn, 'Currently showing 12-hour time \u2014 click to switch to 24-hour');
    } else {
      setTooltip(clockBtn, 'Currently showing 24-hour time \u2014 click to switch to 12-hour');
    }
  }

  clockBtn?.addEventListener('click', () => {
    useHour12 = !useHour12;
    writePref(prefKeys.hour12, useHour12);
    clockBtn.setAttribute('data-active', String(!useHour12));
    if (clockLabel) {
      clockLabel.textContent = useHour12 ? '24h' : '12h';
    }
    updateClockTitle();
    updateTimezoneDisplay();
  }, { signal });

  // Initialize clock toggle state
  if (clockBtn) {
    clockBtn.setAttribute('data-active', String(!useHour12));
    if (clockLabel) {
      clockLabel.textContent = useHour12 ? '24h' : '12h';
    }
    updateClockTitle();
  }

  // Detect if user's timezone differs from PT; if same, hide the toggle
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (userTz === 'America/Los_Angeles' && tzBtn) {
    tzBtn.style.display = 'none';
  }

  // Apply local time on load & set toggle state
  if (tzBtn) {
    tzBtn.setAttribute('data-active', String(showLocalTime));
  }
  if (tzLabel && showLocalTime) {
    const abbr = getUserTzAbbr();
    tzLabel.textContent = `Showing ${abbr}`;
  }
  updateTzTitle();
  updateTimezoneDisplay();
  applyFilters();
}

// Run on load
initSessionGrid();
export {};
