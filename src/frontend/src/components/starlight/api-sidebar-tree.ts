/**
 * Swaps the server-rendered C# API sidebar spine (search link, package
 * overview, current type) for the package's full tree, loaded once per
 * package from `/reference/api/csharp/{package}/sidebar.json`.
 *
 * New entries are cloned from the spine's own markup so they stay identical to
 * Starlight's `<SidebarSublist>` output, and Starlight's `sl-sidebar-state`
 * session storage is reused so open groups and scroll survive navigation
 * within a package.
 */

type CompactSidebarNode = [label: string, hrefOrChildren: string | CompactSidebarNode[]];

interface SidebarTreePayload {
  hash: string;
  items: CompactSidebarNode[];
}

interface StoredSidebarState {
  hash?: string;
  open?: Array<boolean | null>;
  scroll?: number;
}

interface Templates {
  link: HTMLLIElement;
  groupItem: HTMLLIElement;
  details: HTMLDetailsElement;
  summary: HTMLElement;
  restore: Element | null;
  list: HTMLUListElement;
}

export const API_SIDEBAR_TREE_LOADED_EVENT = 'api-sidebar:tree-loaded';
const STATE_KEY = 'sl-sidebar-state';
const payloads = new Map<string, Promise<SidebarTreePayload | null>>();

function isPayload(value: unknown): value is SidebarTreePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SidebarTreePayload).hash === 'string' &&
    Array.isArray((value as SidebarTreePayload).items)
  );
}

function loadPayload(src: string): Promise<SidebarTreePayload | null> {
  let payload = payloads.get(src);
  if (!payload) {
    payload = fetch(src, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((value) => {
        if (isPayload(value)) return value;
        payloads.delete(src);
        return null;
      });
    payloads.set(src, payload);
  }
  return payload;
}

function normalizePath(pathname: string): string {
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

function directChild<T extends Element>(parent: Element, tagName: string): T | null {
  return (Array.from(parent.children).find((child) => child.tagName === tagName) as T) ?? null;
}

function findTemplates(packageDetails: HTMLDetailsElement): Templates | null {
  const list = directChild<HTMLUListElement>(packageDetails, 'UL');
  const summary = directChild<HTMLElement>(packageDetails, 'SUMMARY');
  const groupItem = packageDetails.parentElement as HTMLLIElement | null;
  const link = list
    ? (Array.from(list.children).find((li) => li.firstElementChild?.tagName === 'A') as
        | HTMLLIElement
        | undefined)
    : undefined;
  if (!list || !summary || !groupItem || !link) return null;
  return {
    link,
    groupItem,
    details: packageDetails,
    summary,
    restore: directChild(packageDetails, 'SL-SIDEBAR-RESTORE'),
    list,
  };
}

function buildList(
  nodes: CompactSidebarNode[],
  baseHref: string,
  currentPath: string,
  templates: Templates
): HTMLUListElement {
  const ul = templates.list.cloneNode(false) as HTMLUListElement;
  for (const [label, value] of nodes) {
    if (typeof value === 'string') {
      const li = templates.link.cloneNode(true) as HTMLLIElement;
      const anchor = li.querySelector('a')!;
      const href = new URL(value, new URL(baseHref, location.origin)).pathname;
      anchor.setAttribute('href', href);
      if (normalizePath(href) === currentPath) {
        anchor.setAttribute('aria-current', 'page');
      } else {
        anchor.removeAttribute('aria-current');
      }
      const labelEl = anchor.querySelector(':scope > span') ?? anchor;
      labelEl.textContent = label;
      ul.append(li);
      continue;
    }

    const li = templates.groupItem.cloneNode(false) as HTMLLIElement;
    const details = templates.details.cloneNode(false) as HTMLDetailsElement;
    details.removeAttribute('open');
    const summary = templates.summary.cloneNode(true) as HTMLElement;
    const labelEl = summary.querySelector('.group-label .large') ?? summary.querySelector('.group-label');
    if (labelEl) labelEl.textContent = label;
    details.append(summary);
    if (templates.restore) details.append(templates.restore.cloneNode(false));
    details.append(buildList(value, baseHref, currentPath, templates));
    li.append(details);
    ul.append(li);
  }
  return ul;
}

function readStoredState(hash: string): StoredSidebarState | null {
  try {
    const state = JSON.parse(sessionStorage.getItem(STATE_KEY) || '0') as StoredSidebarState | 0;
    return state && state.hash === hash && Array.isArray(state.open) ? state : null;
  } catch {
    return null;
  }
}

function applyTree(container: HTMLElement, payload: SidebarTreePayload): boolean {
  const persist = container.querySelector<HTMLElement>('sl-sidebar-state-persist');
  const topList = persist?.querySelector(':scope > ul.top-level');
  const packageDetails = topList?.querySelector<HTMLDetailsElement>(':scope > li > details');
  if (!persist || !packageDetails) return false;
  const templates = findTemplates(packageDetails);
  if (!templates) return false;

  const baseHref = new URL(container.dataset.apiSidebarTree!, location.href).pathname.replace(
    /[^/]*$/,
    ''
  );
  const currentPath = normalizePath(location.pathname);
  const list = buildList(payload.items, baseHref, currentPath, templates);
  packageDetails.replaceChild(list, templates.list);

  const hash = `api:${payload.hash}`;
  persist.dataset.hash = hash;
  const restores = persist.querySelectorAll<HTMLElement>('sl-sidebar-restore');
  restores.forEach((restore, index) => (restore.dataset.index = String(index)));

  // Starlight only restores open state on desktop, where the sidebar is not a menu.
  const stored = matchMedia('(min-width: 50em)').matches ? readStoredState(hash) : null;
  for (const restore of restores) {
    const details = restore.parentElement;
    if (!(details instanceof HTMLDetailsElement)) continue;
    const storedOpen = stored?.open?.[Number(restore.dataset.index)];
    details.open =
      details === packageDetails ||
      details.querySelector('[aria-current="page"]') !== null ||
      storedOpen === true;
  }

  const scroller = document.getElementById('starlight__sidebar');
  if (scroller && stored?.scroll && scroller.scrollTop === 0) {
    scroller.scrollTop = stored.scroll;
  }
  return true;
}

function hydrate(): void {
  const container = document.querySelector<HTMLElement>('.topics-sidebar[data-api-sidebar-tree]');
  const src = container?.dataset.apiSidebarTree;
  if (!container || !src || container.dataset.apiSidebarTreeState) return;
  container.dataset.apiSidebarTreeState = 'loading';

  const run = () => {
    void loadPayload(src).then((payload) => {
      if (!container.isConnected) return;
      if (payload && applyTree(container, payload)) {
        container.dataset.apiSidebarTreeState = 'loaded';
        container.dispatchEvent(new CustomEvent(API_SIDEBAR_TREE_LOADED_EVENT, { bubbles: true }));
      } else {
        container.dataset.apiSidebarTreeState = 'failed';
      }
    });
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 200);
  }
}

export function initApiSidebarTree(): void {
  document.addEventListener('astro:page-load', hydrate);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrate, { once: true });
  } else {
    hydrate();
  }
}
