// Restores persisted AppHost language and sidebar collapse state before first paint, and keeps
// them in sync across ClientRouter navigations. Loaded as a render-blocking external script from
// Head.astro (served from the immutable /_astro/ cache) instead of being inlined in every page.
// Plain browser JavaScript (not TypeScript): Vite emits `?url` imports verbatim, without transpiling.
(function () {
  var appHostLangLabels = {
    csharp: 'C#',
    typescript: 'TypeScript',
    go: 'Go',
  };
  var appHostLangStorageKey = 'starlight-synced-tabs__aspire-lang';

  function normalizeAppHostLang(value) {
    var normalized = (value || '').toLowerCase().replace(/\s+/g, '');
    if (normalized.indexOf('typescript') !== -1) {
      return 'typescript';
    }
    if (normalized === 'go' || normalized === 'golang') {
      return 'go';
    }
    if (
      normalized.indexOf('c#') !== -1 ||
      normalized.indexOf('csharp') !== -1 ||
      normalized.indexOf('c-sharp') !== -1
    ) {
      return 'csharp';
    }
    return '';
  }

  function updateAppHostLangUrl(value) {
    var normalized = normalizeAppHostLang(value);
    if (!normalized) return;

    var url = new URL(window.location);
    url.searchParams.set('aspire-lang', normalized);
    window.history.replaceState(window.history.state, '', url);
  }

  function persistAppHostLang(value, root) {
    var normalized = normalizeAppHostLang(value);
    if (!normalized) return '';

    (root || document.documentElement).setAttribute('data-apphost-lang', normalized);
    try {
      localStorage.setItem('aspire-lang', normalized);
      localStorage.setItem(appHostLangStorageKey, appHostLangLabels[normalized]);
    } catch {}
    return normalized;
  }

  function syncAppHostLangFromTab(value) {
    var normalized = persistAppHostLang(value);
    if (!normalized) return;
    updateAppHostLangUrl(normalized);
  }

  function initAppHostLangSync() {
    if (window.__aspireAppHostLangSyncInitialized) return;
    window.__aspireAppHostLangSyncInitialized = true;

    document.addEventListener('astro:before-swap', function (event) {
      restorePreferences(event.newDocument.documentElement, event.to);
    });

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;

      var tab = target.closest('starlight-tabs[data-sync-key="aspire-lang"] [role="tab"]');
      if (tab) {
        var tabValue = normalizeAppHostLang(tab.textContent);
        if (tabValue) {
          window.requestAnimationFrame(function () {
            syncAppHostLangFromTab(tabValue);
          });
        }
      }
    });

    document.addEventListener('keydown', function (event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      var target = event.target;
      if (!(target instanceof Element)) return;
      var starlightTabs = target.closest('starlight-tabs[data-sync-key="aspire-lang"]');
      if (!starlightTabs) return;

      window.requestAnimationFrame(function () {
        var selectedTab = starlightTabs.querySelector('[role="tab"][aria-selected="true"]');
        var selectedValue = normalizeAppHostLang(selectedTab && selectedTab.textContent);
        if (selectedValue) {
          syncAppHostLangFromTab(selectedValue);
        }
      });
    });
  }

  function restorePreferences(root, url) {
    var qsAppHostLang = persistAppHostLang(url.searchParams.get('aspire-lang'), root);
    var rawAppHostLang = qsAppHostLang || 'typescript';

    try {
      rawAppHostLang =
        qsAppHostLang ||
        localStorage.getItem('aspire-lang') ||
        localStorage.getItem('aspire-apphost-lang') ||
        localStorage.getItem(appHostLangStorageKey) ||
        localStorage.getItem('starlight-synced-tabs__apphost-lang') ||
        localStorage.getItem('starlight-synced-tabs__apphost-implementation-lang') ||
        'typescript';
    } catch {}

    persistAppHostLang(normalizeAppHostLang(rawAppHostLang) || 'typescript', root);

    try {
      var isApi = url.pathname.indexOf('/reference/api') !== -1;
      root.toggleAttribute(
        'data-sidebar-collapsed',
        isApi && localStorage.getItem('api-sidebar-collapsed') === '1'
      );
      root.toggleAttribute(
        'data-topic-sidebar-collapsed',
        !isApi && localStorage.getItem('topic-sidebar-collapsed') === '1'
      );
    } catch {}
  }

  restorePreferences(document.documentElement, new URL(window.location.href));

  // Seed the OsAwareTabs default before Starlight's per-tabs restore script runs during
  // parsing, so first-visit Windows readers see PowerShell without a Bash flash.
  try {
    var shellKey = 'starlight-synced-tabs__terminal';
    if (!localStorage.getItem(shellKey)) {
      var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
      localStorage.setItem(shellKey, /^win/i.test(platform) || /Win(dows|32|64)/i.test(platform) ? 'PowerShell' : 'Bash');
    }
  } catch {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppHostLangSync);
  } else {
    initAppHostLangSync();
  }
})();
