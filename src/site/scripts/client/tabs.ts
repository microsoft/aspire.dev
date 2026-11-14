// Ported from src/frontend/node_modules/@astrojs/starlight/user-components/Tabs.astro (<script>),
// Starlight 0.41.3, M3 of docs/douze-migration-plan.md. The constructor first builds the tab list from the
// panels when the server rendered it empty (contract C4, lib/tabs-build.ts); the rest is Starlight's code.
import { buildTabList } from './lib/tabs-build';

class StarlightTabs extends HTMLElement {
  // A map of sync keys to all tabs that are synced to that key.
  static #syncedTabs = new Map<string, StarlightTabs[]>();

  tabs: HTMLAnchorElement[];
  panels: HTMLElement[];
  #syncKey: string | undefined;
  // The storage key prefix should be in sync with the one used in the restore script.
  #storageKeyPrefix = 'starlight-synced-tabs__';

  constructor() {
    super();
    buildTabList(this);
    const tablist = this.querySelector<HTMLUListElement>('[role="tablist"]')!;
    this.tabs = [...tablist.querySelectorAll<HTMLAnchorElement>('[role="tab"]')];
    this.panels = [...this.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]')];
    this.#syncKey = this.dataset.syncKey;

    if (this.#syncKey) {
      const syncedTabs = StarlightTabs.#syncedTabs.get(this.#syncKey) ?? [];
      syncedTabs.push(this);
      StarlightTabs.#syncedTabs.set(this.#syncKey, syncedTabs);
    }

    this.tabs.forEach((tab, i) => {
      // Handle clicks for mouse users
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const currentTab = tablist.querySelector('[aria-selected="true"]');
        if (e.currentTarget !== currentTab) {
          this.switchTab(e.currentTarget as HTMLAnchorElement, i);
        }
      });

      // Handle keyboard input
      tab.addEventListener('keydown', (e) => {
        const index = this.tabs.indexOf(e.currentTarget as any);
        // Work out which key the user is pressing and
        // Calculate the new tab's index where appropriate
        const nextIndex =
          e.key === 'ArrowLeft'
            ? index - 1
            : e.key === 'ArrowRight'
              ? index + 1
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? this.tabs.length - 1
                  : null;
        if (nextIndex === null) return;
        if (this.tabs[nextIndex]) {
          e.preventDefault();
          this.switchTab(this.tabs[nextIndex], nextIndex);
        }
      });
    });
  }

  switchTab(newTab: HTMLAnchorElement | null | undefined, index: number, shouldSync = true) {
    if (!newTab) return;

    // If tabs should be synced, we store the current position so we can restore it after
    // switching tabs to prevent the page from jumping when the new tab content is of a different
    // height than the previous tab.
    const previousTabsOffset = shouldSync ? this.getBoundingClientRect().top : 0;

    // Mark all tabs as unselected and hide all tab panels.
    this.tabs.forEach((tab) => {
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('tabindex', '-1');
    });
    this.panels.forEach((oldPanel) => {
      oldPanel.hidden = true;
    });

    // Show new panel and mark new tab as selected.
    const newPanel = this.panels[index];
    if (newPanel) newPanel.hidden = false;
    // Restore active tab to the default tab order.
    newTab.removeAttribute('tabindex');
    newTab.setAttribute('aria-selected', 'true');
    if (shouldSync) {
      newTab.focus();
      StarlightTabs.#syncTabs(this, newTab);
      window.scrollTo({
        top: window.scrollY + (this.getBoundingClientRect().top - previousTabsOffset),
        behavior: 'instant',
      });
    }
  }

  #persistSyncedTabs(label: string) {
    if (!this.#syncKey || typeof localStorage === 'undefined') return;
    localStorage.setItem(this.#storageKeyPrefix + this.#syncKey, label);
  }

  static #syncTabs(emitter: StarlightTabs, newTab: HTMLAnchorElement) {
    const syncKey = emitter.#syncKey;
    const label = StarlightTabs.#getTabLabel(newTab);
    if (!syncKey || !label) return;
    const syncedTabs = StarlightTabs.#syncedTabs.get(syncKey);
    if (!syncedTabs) return;

    for (const receiver of syncedTabs) {
      if (receiver === emitter) continue;
      const labelIndex = receiver.tabs.findIndex((tab) => StarlightTabs.#getTabLabel(tab) === label);
      if (labelIndex === -1) continue;
      receiver.switchTab(receiver.tabs[labelIndex], labelIndex, false);
    }

    emitter.#persistSyncedTabs(label);
  }

  static #getTabLabel(tab: HTMLAnchorElement) {
    // `textContent` returns the content of all elements. In the case of a tab with an icon, this
    // could potentially include extra spaces due to the presence of the SVG icon.
    // To sync tabs with the same sync key and label, no matter the presence of an icon, we trim
    // these extra spaces.
    return tab.textContent?.trim();
  }
}

if (!customElements.get('starlight-tabs')) customElements.define('starlight-tabs', StarlightTabs);
