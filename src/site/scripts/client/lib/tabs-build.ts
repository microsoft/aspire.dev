// Builds the tab list of a <starlight-tabs> on the client (contract C4 of the M3 chrome port).
//
// Starlight renders the tab list on the server from the panels (user-components/Tabs.astro and
// rehype-tabs.ts). A Douze shortcode renders its body before the enclosing one, so the `tabs` shortcode
// cannot see its tabs' labels: it renders an empty `ul[role=tablist]` and each `tab` renders
// `<div role="tabpanel" data-label="..." data-icon="...">`. This function produces Starlight's final DOM
// from that markup:
//
//   <li role="presentation" class="tab">
//     <a role="tab" href="#tab-panel-N" id="tab-N" aria-selected="true|false" tabindex="0|-1">
//       <svg ...class="tab-icon"><use href="/assets/icons.svg#ICON"></use></svg> LABEL
//     </a>
//   </li>
//
// and, on the panels, `id="tab-panel-N"`, `aria-labelledby="tab-N"`, `tabindex="0"` when the panel has no
// focusable element, and `hidden` on every panel but the selected one. The selected panel is the one
// whose label matches the synced choice in localStorage (`starlight-synced-tabs__<key>`), else the first.
// For OS aware tabs (`data-os-aware` on <starlight-tabs>), a missing choice defaults to PowerShell on
// Windows and Bash elsewhere, and is stored (OsAwareTabs.astro's inline script).
//
// When the server rendered the tab list (partials/tabs-markup.liquid: first tab selected, other panels hidden), it
// only applies that selection to the existing list and panels.
//
// It runs from the inline `starlight-tabs-restore` element (no flash of the wrong tab) and again from the
// StarlightTabs element constructor (tabs without a restore element); it is idempotent (data-tabs-ready).

const STORAGE_PREFIX = 'starlight-synced-tabs__';

// https://github.com/adobe/react-spectrum/blob/99ca82e87ba2d7fdd54f5b49326fd242320b4b51/packages/%40react-aria/focus/src/FocusScope.tsx#L256-L275
const focusableElementSelectors = [
  'input:not([disabled]):not([type=hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  'area[href]',
  'summary',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]',
  '[tabindex]:not([disabled])',
]
  .map((selector) => `${selector}:not([hidden]):not([tabindex="-1"])`)
  .join(',');

declare global {
  interface Window {
    __starlightTabCount?: number;
  }
}

function nextId(): number {
  const id = window.__starlightTabCount ?? 0;
  window.__starlightTabCount = id + 1;
  return id;
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function osDefaultLabel(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  let isWindows = false;
  const platform = nav.userAgentData?.platform;
  if (platform) isWindows = /windows/i.test(platform);
  else if (typeof navigator.platform === 'string') isWindows = /^Win/i.test(navigator.platform);
  else if (typeof navigator.userAgent === 'string') isWindows = /Win(dows|32|64)/i.test(navigator.userAgent);
  return isWindows ? 'PowerShell' : 'Bash';
}

function iconMarkup(name: string): string {
  const escaped = name.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  return (
    '<svg aria-hidden="true" class="tab-icon cid-sl-icon" width="16" height="16" fill="currentColor">' +
    `<use href="/assets/icons.svg#${escaped}"></use></svg>`
  );
}

/** The index of the panel to select: the synced choice (stored, or the OS default for OS aware tabs), else 0. */
function selectedIndex(tabs: HTMLElement, labels: string[]): number {
  const syncKey = tabs.dataset.syncKey;
  if (!syncKey) return 0;
  let stored = readStorage(STORAGE_PREFIX + syncKey);
  if (!stored && tabs.hasAttribute('data-os-aware')) {
    stored = osDefaultLabel();
    writeStorage(STORAGE_PREFIX + syncKey, stored);
  }
  if (!stored) return 0;
  const index = labels.indexOf(stored);
  return index > 0 ? index : 0;
}

/** Panel attributes of Starlight's markup: no build-time data, focusable when it holds nothing focusable. */
function finishPanel(panel: HTMLElement): void {
  panel.removeAttribute('data-label');
  panel.removeAttribute('data-icon');
  if (!panel.querySelector(focusableElementSelectors)) panel.setAttribute('tabindex', '0');
}

/**
 * Selects the synced tab of a tab list rendered on the server (partials/tabs-markup.liquid renders the first tab
 * selected): `aria-selected`, `tabindex` and the panels' `hidden`.
 */
function applySelection(tabs: HTMLElement, tablist: HTMLUListElement, panels: HTMLElement[]): boolean {
  if (tabs.dataset.tabsReady === 'true') return false;
  tabs.dataset.tabsReady = 'true';
  const links = Array.from(tablist.querySelectorAll<HTMLAnchorElement>('[role="tab"]'));
  const selected = selectedIndex(tabs, links.map((link) => (link.textContent ?? '').trim()));
  links.forEach((link, index) => {
    link.setAttribute('aria-selected', index === selected ? 'true' : 'false');
    link.setAttribute('tabindex', index === selected ? '0' : '-1');
  });
  panels.forEach((panel, index) => {
    finishPanel(panel);
    panel.hidden = index !== selected;
  });
  return true;
}

/**
 * Fills the tab list of `tabs` from its panels, or, when the server rendered it, selects the synced tab in it;
 * returns false when there was nothing to do.
 */
export function buildTabList(tabs: HTMLElement): boolean {
  const tablist = tabs.querySelector<HTMLUListElement>(':scope > .tablist-wrapper [role="tablist"]');
  if (!tablist) return false;
  const panels = Array.from(tabs.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]'));
  if (panels.length === 0) return false;
  if (tablist.children.length > 0) return applySelection(tabs, tablist, panels);
  tabs.dataset.tabsReady = 'true';

  const labels = panels.map((panel) => (panel.dataset.label ?? '').trim());
  const selected = selectedIndex(tabs, labels);

  panels.forEach((panel, index) => {
    const id = nextId();
    const panelId = 'tab-panel-' + id;
    const tabId = 'tab-' + id;
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    li.className = 'tab';
    const a = document.createElement('a');
    a.setAttribute('role', 'tab');
    a.href = '#' + panelId;
    a.id = tabId;
    a.setAttribute('aria-selected', index === selected ? 'true' : 'false');
    a.setAttribute('tabindex', index === selected ? '0' : '-1');
    const icon = panel.dataset.icon;
    a.innerHTML = icon ? iconMarkup(icon) : '';
    a.append(labels[index]);
    li.append(a);
    tablist.append(li);

    panel.id = panelId;
    panel.setAttribute('aria-labelledby', tabId);
    finishPanel(panel);
    panel.hidden = index !== selected;
  });
  return true;
}
