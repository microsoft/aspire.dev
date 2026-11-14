// Inline (pre-paint) script: defines <starlight-tabs-restore>, from Starlight's Tabs.astro is:inline
// script and OsAwareTabs.astro's inline script. Starlight renders the restore element as the last child
// of a synced <starlight-tabs>; its connectedCallback runs once the panels are parsed, builds the tab
// list (lib/tabs-build.ts) and selects the synced tab before the first paint. Built by build-client.mjs
// as an IIFE into assets/js/inline/tabs-restore.js; load it in the head as a classic, blocking script
// (or inline it). The element also works as the next sibling of the <starlight-tabs>.
import { buildTabList } from '../lib/tabs-build';

if (!customElements.get('starlight-tabs-restore')) {
  customElements.define(
    'starlight-tabs-restore',
    class StarlightTabsRestore extends HTMLElement {
      connectedCallback() {
        const tabs =
          this.closest('starlight-tabs') ??
          (this.previousElementSibling?.matches('starlight-tabs') ? this.previousElementSibling : null);
        if (tabs instanceof HTMLElement) buildTabList(tabs);
      }
    }
  );
}
