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

interface BuildContext {
  baseHref: string;
  currentPath: string;
  templates: Templates;
  /** Server-rendered spine groups keyed by their Overview link, spliced in place of tree nodes. */
  spine: Map<string, HTMLLIElement>;
  /** Next `sl-sidebar-restore` index; tree positions keep the same index on every page. */
  nextIndex: number;
}

function countGroups(nodes: CompactSidebarNode[]): number {
  return nodes.reduce(
    (count, [, value]) => (typeof value === 'string' ? count : count + 1 + countGroups(value)),
    0
  );
}

function resolveHref(value: string, baseHref: string): string {
  return new URL(value, new URL(baseHref, location.origin)).pathname;
}

/** The pathname of a node's own page: a link's href or a group's leading Overview link. */
function nodePath(value: string | CompactSidebarNode[], baseHref: string): string | undefined {
  if (typeof value === 'string') return normalizePath(resolveHref(value, baseHref));
  const first = value[0];
  return first && typeof first[1] === 'string' ? normalizePath(resolveHref(first[1], baseHref)) : undefined;
}

function spliceSpine(li: HTMLLIElement, value: string | CompactSidebarNode[], ctx: BuildContext): HTMLLIElement {
  // The spine keeps the current page's section anchors; only its own group
  // takes a tree index, so indices after it match every other page.
  const restores = li.querySelectorAll<HTMLElement>('sl-sidebar-restore');
  restores.forEach((restore, index) => {
    restore.dataset.index = index === 0 && typeof value !== 'string' ? String(ctx.nextIndex) : '-1';
  });
  if (typeof value !== 'string') ctx.nextIndex += 1 + countGroups(value);
  return li;
}

function buildList(nodes: CompactSidebarNode[], ctx: BuildContext): HTMLUListElement {
  const { templates } = ctx;
  const ul = templates.list.cloneNode(false) as HTMLUListElement;
  for (const [label, value] of nodes) {
    const path = nodePath(value, ctx.baseHref);
    const spineItem = path ? ctx.spine.get(path) : undefined;
    if (spineItem) {
      ctx.spine.delete(path!);
      ul.append(spliceSpine(spineItem, value, ctx));
      continue;
    }

    if (typeof value === 'string') {
      const li = templates.link.cloneNode(true) as HTMLLIElement;
      const anchor = li.querySelector('a')!;
      const href = resolveHref(value, ctx.baseHref);
      anchor.setAttribute('href', href);
      if (normalizePath(href) === ctx.currentPath) {
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
    if (templates.restore) {
      const restore = templates.restore.cloneNode(false) as HTMLElement;
      restore.dataset.index = String(ctx.nextIndex++);
      details.append(restore);
    }
    details.append(buildList(value, ctx));
    li.append(details);
    ul.append(li);
  }
  return ul;
}

/** Collect the spine's groups (e.g. the current type or item) by their Overview link. */
function collectSpine(list: HTMLUListElement): Map<string, HTMLLIElement> {
  const spine = new Map<string, HTMLLIElement>();
  for (const details of list.querySelectorAll<HTMLDetailsElement>('li > details')) {
    const childList = directChild<HTMLUListElement>(details, 'UL');
    const first = childList?.firstElementChild?.firstElementChild;
    const li = details.parentElement as HTMLLIElement;
    if (first?.tagName !== 'A') continue;
    const path = normalizePath(new URL(first.getAttribute('href')!, location.href).pathname);
    if (!spine.has(path)) spine.set(path, li);
  }
  return spine;
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

  // `.pathname` drops the `?v=` version, so hrefs resolve against the sidebar.json folder.
  const baseHref = new URL(container.dataset.apiSidebarTree!, location.href).pathname.replace(
    /[^/]*$/,
    ''
  );
  const packageRestore = directChild<HTMLElement>(packageDetails, 'SL-SIDEBAR-RESTORE');
  if (packageRestore) packageRestore.dataset.index = '0';
  const ctx: BuildContext = {
    baseHref,
    currentPath: normalizePath(location.pathname),
    templates,
    spine: collectSpine(templates.list),
    nextIndex: 1,
  };
  const topAnchors = Array.from(templates.list.children).filter((li) =>
    li.firstElementChild?.getAttribute('href')?.includes('#')
  );
  const list = buildList(payload.items, ctx);
  // Overview pages list their own section anchors directly under the package.
  list.firstElementChild?.after(...topAnchors);
  packageDetails.replaceChild(list, templates.list);

  const hash = `api:${payload.hash}`;
  persist.dataset.hash = hash;

  // Starlight only restores open state on desktop, where the sidebar is not a menu.
  const stored = matchMedia('(min-width: 50em)').matches ? readStoredState(hash) : null;
  for (const restore of persist.querySelectorAll<HTMLElement>('sl-sidebar-restore')) {
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
