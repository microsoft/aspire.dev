import { navigate } from 'astro:transitions/client';

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

/** Keep query-only controls in place while Astro owns history indexes and traversal. */
export function createFilterHistory(
  root: HTMLElement,
  parameters: readonly string[],
  restore: () => void,
  signal: AbortSignal,
) {
  const path = root.dataset.filterPath!;
  let localSwap: { traverse: boolean; x: number; y: number } | undefined;
  let restoredAfterSwap = false;
  let pending = false;
  let revision = 0;
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

  document.addEventListener('astro:before-swap', (event) => {
    const owned = event.info === root
      || (event.navigationType === 'traverse' && isOwnedEntry(path));
    if (!owned || event.to.pathname !== path || !isFilterNavigation(event.from, event.to, parameters)) return;
    localSwap = { traverse: event.navigationType === 'traverse', x: scrollX, y: scrollY };
    event.viewTransition.skipTransition();
    // The loader (including deployment checks) still runs; only these local results stay mounted.
    event.swap = () => {};
  }, { signal });
  document.addEventListener('astro:after-swap', () => {
    restoredAfterSwap = true;
    if (localSwap && !localSwap.traverse) {
      markEntry();
      window.scrollTo({ left: localSwap.x, top: localSwap.y, behavior: 'instant' });
    } else {
      restoreCurrent();
    }
    localSwap = undefined;
  }, { signal });
  document.addEventListener('astro:page-load', () => {
    if (!restoredAfterSwap) restoreCurrent();
    restoredAfterSwap = false;
  }, { signal });

  return {
    initialize() {
      // Connected callbacks run inside a swap, before Astro updates location.
      if (!document.documentElement.hasAttribute('data-astro-transition')) restoreCurrent();
    },
    write(url: URL, replace: boolean) {
      if (signal.aborted || !root.isConnected || location.pathname !== path) return;
      markEntry();
      if (url.href === location.href && !pending) return;
      if (replace && !pending) {
        history.replaceState(history.state, '', url);
      } else {
        pending = true;
        const currentRevision = ++revision;
        return navigate(url.href, {
          info: root,
          state: { [historyKey]: path },
          history: replace ? 'replace' : 'push',
        }).finally(() => {
          if (currentRevision === revision) pending = false;
        });
      }
    },
  };
}
