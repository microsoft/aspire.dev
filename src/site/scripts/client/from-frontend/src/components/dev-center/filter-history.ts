const historyKey = 'aspireFilterPath';

function isOwnedEntry(path: string): boolean {
  const state: unknown = history.state;
  return typeof state === 'object' && state !== null
    && historyKey in state && state[historyKey] === path;
}

export function isFilterNavigation(from: URL, to: URL, parameters: readonly string[]): boolean {
  if (from.origin !== to.origin || from.pathname !== to.pathname) return false;
  const unrelated = (url: URL) => {
    const query = new URLSearchParams(url.search);
    for (const name of parameters) query.delete(name);
    query.sort();
    return query.toString();
  };
  return unrelated(from) === unrelated(to);
}

/**
 * Keep query-only controls in place: filter changes update the URL with the History API (no reload),
 * and back/forward between this page's own entries restores the filters (popstate).
 *
 * Douze port (M3): Astro's ClientRouter owned history here (navigate() with a local swap that kept the
 * results mounted); with full page loads, pushState/replaceState and popstate give the same behavior.
 */
export function createFilterHistory(
  root: HTMLElement,
  parameters: readonly string[],
  restore: () => void,
  signal: AbortSignal,
) {
  const path = root.dataset.filterPath!;
  const markEntry = () => {
    if (!isOwnedEntry(path)) {
      history.replaceState({ ...history.state, [historyKey]: path }, '');
    }
  };
  const restoreCurrent = () => {
    if (!root.isConnected || location.pathname !== path) return;
    markEntry();
    restore();
  };
  let current = new URL(location.href);

  window.addEventListener('popstate', () => {
    const next = new URL(location.href);
    const local = isOwnedEntry(path) && isFilterNavigation(current, next, parameters);
    current = next;
    if (local) restoreCurrent();
  }, { signal });

  return {
    initialize() {
      restoreCurrent();
    },
    write(url: URL, replace: boolean) {
      if (signal.aborted || !root.isConnected || location.pathname !== path) return;
      markEntry();
      if (url.href === location.href) return;
      if (replace) {
        history.replaceState(history.state, '', url);
      } else {
        history.pushState({ ...history.state, [historyKey]: path }, '', url);
      }
      current = new URL(location.href);
      return Promise.resolve();
    },
  };
}
