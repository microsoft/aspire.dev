// Ported from src/frontend/src/components/ContainerImages.astro (is:inline script), M3 of
// docs/douze-migration-plan.md: keeps <html data-aspire-lang> in sync with the aspire-lang tabs and other
// windows. The initial value is set before the first paint by inline/preferences.ts.
(function () {
  const KEY = 'starlight-synced-tabs__aspire-lang';

  function normalize(label: string | null | undefined): 'typescript' | 'csharp' | null {
    if (!label) return null;
    const value = label.trim().toLowerCase();
    if (value === 'typescript') return 'typescript';
    if (value === 'c#' || value === 'csharp') return 'csharp';
    return null;
  }

  function readStored() {
    try {
      return normalize(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  }

  function apply(lang: string | null | undefined) {
    document.documentElement.dataset.aspireLang = lang || 'typescript';
  }

  apply(readStored() || document.documentElement.dataset.apphostLang);

  // Starlight persists the choice on tab click; defer a tick so we read the
  // stored value it just wrote rather than the tab we clicked.
  document.addEventListener('click', function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tab = target.closest('starlight-tabs[data-sync-key="aspire-lang"] a[role="tab"]');
    if (!tab) return;
    const clicked = normalize(tab.textContent);
    setTimeout(function () {
      apply(readStored() || clicked);
    }, 0);
  });

  // Keep in sync when the choice changes in another tab/window.
  window.addEventListener('storage', function (event) {
    if (event.key === KEY) apply(normalize(event.newValue));
  });
})();
export {};
