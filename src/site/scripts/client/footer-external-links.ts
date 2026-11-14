// Ported from src/frontend/src/components/starlight/Footer.astro (<script>), M3 of docs/douze-migration-plan.md.
// Astro view transition events removed: every page load is a full document load.
// @ts-nocheck: plain JavaScript (was an is:inline script).
// The original called Astro.locals.t() inside the inline script, which threw at run time, so the
// "(opens in a new tab)" suffix was never added. The translated suffix now comes from the
// data-opens-in-new-tab attribute of the footer (any element carrying it); without it, links only
// get target, rel and the external-link class, as today.
(() => {
  const base = window.location.hostname.replace(/^www\./, '');
  const treatSubdomainsAsInternal = true;

  const sameSite = (host) => {
    const h = host.replace(/^www\./, '');
    if (treatSubdomainsAsInternal) {
      return h === base || h.endsWith('.' + base);
    }
    return h === base;
  };

  const applyExternalLinkAttrs = () => {
    document.querySelectorAll('a[href]').forEach((a) => {
      try {
        const url = new URL(a.getAttribute('href'), window.location.origin);
        if (!/^https?:$/.test(url.protocol)) return;

        if (!sameSite(url.hostname)) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          a.classList.add('external-link');

          const label = a.getAttribute('aria-label');
          const translatedLabel = document.querySelector('[data-opens-in-new-tab]')?.getAttribute('data-opens-in-new-tab');
          if (!translatedLabel) return;
          const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const translatedLabelPattern = new RegExp(`\\(${escapeRegex(translatedLabel)}\\)`, 'i');

          if (!label || !translatedLabelPattern.test(label)) {
            a.setAttribute('aria-label', (label ? label + ' ' : '') + `(${translatedLabel})`);
          }
        }
      } catch {
        /* Ignore malformed URLs. */
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyExternalLinkAttrs, { once: true });
  } else {
    applyExternalLinkAttrs();
  }
})();
export {};
