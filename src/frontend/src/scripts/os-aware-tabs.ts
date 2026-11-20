/**
 * Picks the default shell tab (PowerShell on Windows, Bash elsewhere) for every `<OsAwareTabs>`
 * sync key on the page, unless the visitor already chose one. Each component instance renders a
 * hidden `[data-os-aware-tabs-sync-key]` marker so this shared, cached module can find them.
 */
const MARKER_SELECTOR = '[data-os-aware-tabs-sync-key]';

function activateTabByLabel(starlightTabs: Element, label: string) {
  const tabs = Array.from(starlightTabs.querySelectorAll('[role="tab"]'));
  const panels = Array.from(starlightTabs.querySelectorAll(':scope > [role="tabpanel"]'));
  const tabIndex = tabs.findIndex((tab) => tab.textContent?.trim() === label);

  if (tabIndex < 0) return;

  tabs.forEach((tab, index) => {
    if (!(tab instanceof HTMLElement)) return;
    const isSelected = index === tabIndex;
    tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    tab.setAttribute('tabindex', isSelected ? '0' : '-1');
  });

  panels.forEach((panel, index) => {
    if (!(panel instanceof HTMLElement)) return;
    if (index === tabIndex) {
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', 'true');
    }
  });
}

function isWindowsPlatform() {
  // Check userAgentData.platform first (modern), then navigator.platform, then userAgent.
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  if (platform) {
    return /windows/i.test(platform);
  }
  if (typeof navigator.platform === 'string') {
    return /^Win/i.test(navigator.platform);
  }
  if (typeof navigator.userAgent === 'string') {
    return /Win(dows|32|64)/i.test(navigator.userAgent);
  }
  return false;
}

function applyDefaultShellTab(syncKey: string) {
  const storageKey = `starlight-synced-tabs__${syncKey}`;

  // Only set a default if the visitor hasn't made a choice yet.
  if (localStorage.getItem(storageKey)) return;

  const defaultTab = isWindowsPlatform() ? 'PowerShell' : 'Bash';
  localStorage.setItem(storageKey, defaultTab);

  document
    .querySelectorAll(`starlight-tabs[data-sync-key="${CSS.escape(syncKey)}"]`)
    .forEach((starlightTabs) => activateTabByLabel(starlightTabs, defaultTab));
}

export function initOsAwareTabs() {
  if (typeof localStorage === 'undefined') return;

  const syncKeys = new Set<string>();
  document.querySelectorAll<HTMLElement>(MARKER_SELECTOR).forEach((marker) => {
    const syncKey = marker.dataset.osAwareTabsSyncKey;
    if (syncKey) syncKeys.add(syncKey);
  });

  syncKeys.forEach((syncKey) => {
    try {
      applyDefaultShellTab(syncKey);
    } catch {
      /* Storage can be blocked; Starlight's tabs keep their server-rendered default. */
    }
  });
}
