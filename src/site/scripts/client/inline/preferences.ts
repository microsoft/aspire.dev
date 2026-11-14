// Inline (pre-paint) head script, from Head.astro's is:inline scripts, M3 of docs/douze-migration-plan.md:
// - the AppHost language preference (`?aspire-lang=`, localStorage) on <html data-apphost-lang>, and its
//   sync from the aspire-lang tabs (unchanged but for the ClientRouter `astro:before-swap` hook, removed);
// - <html data-aspire-lang> (ContainerImages.astro's pivot, here before the first paint instead of from its
//   inline script in the body; the module container-images.ts keeps it in sync);
// - the collapsed state of the API and topic sidebars (data-sidebar-collapsed, data-topic-sidebar-collapsed);
// - the WCP consent pre-paint state (data-consent-not-required, from a previous visit), the
//   primeConsentRequirementState part of the consent script (consent.ts has the rest).
// @ts-nocheck
(function () {
  var appHostLangLabels = {
    csharp: 'C#',
    typescript: 'TypeScript',
  };
  var appHostLangStorageKey = 'starlight-synced-tabs__aspire-lang';

  function normalizeAppHostLang(value) {
    var normalized = (value || '').toLowerCase().replace(/\s+/g, '');
    if (normalized.indexOf('typescript') !== -1) {
      return 'typescript';
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
    } catch (e) {}
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
    } catch (e) {}

    var appHostLang = persistAppHostLang(normalizeAppHostLang(rawAppHostLang) || 'typescript', root);
    root.setAttribute('data-aspire-lang', appHostLang || 'typescript');

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
    } catch (e) {}
  }

  restorePreferences(document.documentElement, new URL(window.location.href));

  try {
    if (window.localStorage.getItem('aspireConsentRequired') === 'false') {
      document.documentElement.setAttribute('data-consent-not-required', '');
    }
  } catch (e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppHostLangSync);
  } else {
    initAppHostLangSync();
  }
})();
