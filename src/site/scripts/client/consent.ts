// Ported from src/frontend/src/components/starlight/Head.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// @ts-nocheck: plain JavaScript (was an is:inline script).
// The WCP library itself stays a <script async src="https://wcpstatic.microsoft.com/mscc/lib/v2/wcp-consent.js">
// in the head, and the pre-paint part (primeConsentRequirementState) is also inlined in the head so the
// cookie buttons do not flash; the ClientRouter swap preservation (preserveConsentStyles/BeforeSwap) is gone.
(function () {
  if (window.__aspireWcpConsentInitialized) return;
  window.__aspireWcpConsentInitialized = true;

  // Cookie controls, including the Legal text action, are server-rendered. Once WCP
  // tells us whether consent is required for this region, reflect it on <html>
  // so CSS can hide those buttons where there is nothing to manage (e.g. the
  // US). Persist the answer so a returning visitor doesn't see the button
  // flash in before WCP loads.
  function setConsentRequirementState(isRequired) {
    try {
      var el = document.documentElement;
      if (el) {
        if (isRequired) {
          el.removeAttribute('data-consent-not-required');
        } else {
          el.setAttribute('data-consent-not-required', '');
        }
      }
      window.localStorage.setItem('aspireConsentRequired', isRequired ? 'true' : 'false');
    } catch (e) {}
  }

  // Before WCP loads, hide the buttons only if a previous visit already
  // established that consent is not required here. Unknown => leave them
  // visible; defaulting to visible keeps us failsafe (we never hide a control
  // a required region needs just because WCP was slow or blocked).
  function primeConsentRequirementState() {
    try {
      if (
        window.localStorage.getItem('aspireConsentRequired') === 'false' &&
        document.documentElement
      ) {
        document.documentElement.setAttribute('data-consent-not-required', '');
      }
    } catch (e) {}
  }

  primeConsentRequirementState();

  // Failsafe: if the CDN script is blocked (ad-blocker, firewall, CSP) or slow to
  // arrive, poll for a bounded window and then give up so the page never hangs or
  // spins forever. Consent code must never degrade the rest of the site.
  var MAX_INIT_ATTEMPTS = 150; // ~15s at 100ms intervals
  var initAttempts = 0;

  function toCulture(value) {
    var raw = (value || '').trim().replace('_', '-');
    if (!raw) return 'en-US';
    var parts = raw.split('-');
    var lang = (parts[0] || 'en').toLowerCase();
    var region = parts[1] ? parts[1].toUpperCase() : '';
    return region ? lang + '-' + region : lang;
  }

  function withSiteConsent(callback) {
    var siteConsent = window.__aspireWcpSiteConsent;
    if (!siteConsent) return false;
    try {
      callback(siteConsent);
    } catch (e) {}
    return true;
  }

  // WCP is a consent-collection API — unlike the previous cookie library it does
  // NOT manage <script> tags. The analytics scripts ship inert as
  // `type="text/plain" data-category="analytics"`; we must promote them to
  // executable ourselves once WCP reports Analytics consent (granted by default
  // where consent isn't required, e.g. the US). Without this bridge analytics
  // never loads anywhere.
  function activateAnalyticsScripts() {
    if (window.__aspireAnalyticsActivated) return;
    window.__aspireAnalyticsActivated = true;
    var pending = document.querySelectorAll(
      'script[type="text/plain"][data-category="analytics"]'
    );
    for (var i = 0; i < pending.length; i++) {
      var old = pending[i];
      var next = document.createElement('script');
      for (var a = 0; a < old.attributes.length; a++) {
        var attr = old.attributes[a];
        // Drop the neutralizing `type="text/plain"` so the browser executes it.
        if (attr.name === 'type') continue;
        next.setAttribute(attr.name, attr.value);
      }
      if (old.textContent) next.textContent = old.textContent;
      // The analytics scripts are order-dependent: the SDK must run before
      // 1ds.js (which reads `oneDS`) and track.js (which reads
      // `window.analytics`). Dynamically-created scripts default to async=true
      // and the copied `defer` is a no-op for them, so without this the two
      // tiny same-origin scripts win the race against the ~140 KB SDK and each
      // bail silently. Forcing async=false runs them in insertion (document)
      // order. Set after the copy so a stray `async` attribute can't override.
      next.async = false;
      if (old.parentNode) old.parentNode.replaceChild(next, old);
    }
  }

  function applyConsentToScripts(siteConsent) {
    try {
      var consent =
        typeof siteConsent.getConsent === 'function' ? siteConsent.getConsent() : null;
      if (consent && consent.Analytics) {
        activateAnalyticsScripts();
      }
    } catch (e) {}
  }

  function openManageConsent(event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('[data-cookie-manage-consent]')) return;
    var opened = false;
    withSiteConsent(function (siteConsent) {
      if (siteConsent.isConsentRequired) {
        siteConsent.manageConsent();
        opened = true;
      }
    });
    // Only suppress the trigger's native action when we actually opened WCP's
    // dialog. If WCP is blocked/slow (ad-blocker, CSP) or consent isn't required
    // here, leave the default behavior intact instead of swallowing the click.
    if (opened) event.preventDefault();
  }

  function onConsentChanged() {
    // WCP fires this when the visitor changes their choices. Reload so the new
    // consent is applied consistently across any consent-gated behavior.
    window.setTimeout(function () {
      window.location.reload();
    }, 0);
  }

  function ensureBannerPlaceholder() {
    var id = 'wcp-cookie-banner';
    var placeholder = document.getElementById(id);
    if (placeholder) return placeholder;
    if (!document.body) return null;
    placeholder = document.createElement('div');
    placeholder.id = id;
    // Dedicated placeholder pinned to the top of the viewport. WCP injects its
    // banner INTO this element in normal flow, so without a top-anchored host the
    // banner lands wherever the host sits. Using document.body dropped it at the
    // very bottom of the page (invisible on load) which fails the compliance scan.
    // A fixed, full-width, top strip guarantees the standard banner is visible on
    // load regardless of scroll position or the site's own sticky header.
    placeholder.style.position = 'fixed';
    placeholder.style.top = '0';
    placeholder.style.left = '0';
    placeholder.style.width = '100%';
    placeholder.style.zIndex = '2147483647';
    document.body.insertBefore(placeholder, document.body.firstChild);
    return placeholder;
  }

  function applyBannerHeight() {
    var placeholder = document.getElementById('wcp-cookie-banner');
    if (!placeholder) return;
    document.documentElement.style.setProperty(
      '--wcp-banner-height',
      (placeholder.offsetHeight || 0) + 'px'
    );
  }

  // While WCP's banner is visible it sits in a fixed, full-width strip at the top
  // of the viewport (see ensureBannerPlaceholder). Publish its live height as a
  // custom property so CSS can push the fixed site header + content down by
  // exactly that much instead of letting the banner overlay them. Tracks wraps
  // and viewport resizes; collapses back to 0 when WCP removes the banner.
  function trackBannerHeight() {
    try {
      var placeholder = document.getElementById('wcp-cookie-banner');
      if (
        !placeholder ||
        window.__aspireWcpBannerObserver ||
        typeof ResizeObserver === 'undefined'
      ) {
        return;
      }
      var observer = new ResizeObserver(applyBannerHeight);
      observer.observe(placeholder);
      window.__aspireWcpBannerObserver = observer;
      applyBannerHeight();
    } catch (e) {}
  }

  // WCP paints the banner AND the preferences dialog from the theme passed at
  // init time and does not re-read the site theme on its own. WCP exposes no
  // `theme-changed` event — its only supported runtime re-theme hook is
  // `siteConsent.applyTheme(name)`, whose argument is the string theme KEY (it
  // looks the theme up in its internal map by that key). Our CSS overrides
  // already re-theme the visible surfaces instantly from custom properties;
  // calling applyTheme keeps WCP's own internal nodes in sync on theme toggles.
  function resolveWcpTheme(themeName) {
    // Resolve the site's data-theme to the WCP theme KEY. Both applyTheme and
    // init expect this string ('dark' | 'light'); passing a wcp.themes[...]
    // OBJECT instead makes applyTheme do `this.themes[object]` -> undefined ->
    // "Theme not found error" (silently swallowed), so the re-theme never runs.
    return (themeName || '').toLowerCase() === 'dark' ? 'dark' : 'light';
  }

  function applyWcpTheme() {
    // applyTheme takes the string theme key and throws on an unknown key;
    // withSiteConsent swallows that so a renamed/absent theme can't break the
    // observer.
    withSiteConsent(function (siteConsent) {
      if (typeof siteConsent.applyTheme === 'function') {
        siteConsent.applyTheme(
          resolveWcpTheme(document.documentElement.getAttribute('data-theme'))
        );
      }
    });
  }

  function watchThemeChanges() {
    try {
      if (window.__aspireWcpThemeObserver || !document.documentElement) return;
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].attributeName === 'data-theme') {
            applyWcpTheme();
            break;
          }
        }
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
      window.__aspireWcpThemeObserver = observer;
    } catch (e) {}
  }

  function initWcpConsent() {
    var wcp = window.WcpConsent;
    if (!wcp || typeof wcp.init !== 'function') {
      if (++initAttempts >= MAX_INIT_ATTEMPTS) return; // give up; page stays fully functional
      window.setTimeout(initWcpConsent, 100);
      return;
    }

    try {
      var culture = toCulture(document.documentElement.lang || navigator.language || 'en-US');
      // The string theme key WCP's init expects as its 5th argument. (The
      // current CDN build ignores this arg; our CSS overrides theme the visible
      // surfaces regardless, and applyWcpTheme() re-syncs WCP's own nodes on
      // later theme toggles.)
      var theme = resolveWcpTheme(document.documentElement.getAttribute('data-theme'));
      var host = ensureBannerPlaceholder() || document.body;
      trackBannerHeight();

      wcp.init(
        culture,
        host,
        function (err, siteConsent) {
          if (err || !siteConsent) return;
          window.__aspireWcpSiteConsent = siteConsent;
          setConsentRequirementState(!!siteConsent.isConsentRequired);
          applyWcpTheme();
          // Bridge WCP consent to our inert analytics scripts. onConsentChanged
          // reloads, so a later grant is re-applied by this same path on re-init.
          applyConsentToScripts(siteConsent);
        },
        // Single registration: passing onConsentChanged as init's 4th argument
        // registers it once. WCP stores consent callbacks in a LIST, so ALSO
        // calling siteConsent.onConsentChanged(onConsentChanged) would fire it
        // twice (two reloads per change).
        onConsentChanged,
        theme
      );
    } catch (e) {
      // Never let consent initialization break page rendering. Retry within
      // the bounded window in case WCP delivered a transient or partial payload.
      if (++initAttempts < MAX_INIT_ATTEMPTS) {
        window.setTimeout(initWcpConsent, 100);
      }
    }
  }

  document.addEventListener('click', openManageConsent);
  watchThemeChanges();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWcpConsent, { once: true });
  } else {
    initWcpConsent();
  }
})();
export {};
