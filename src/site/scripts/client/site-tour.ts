// Ported from src/frontend/src/components/SiteTour.astro (<script> and its define:vars inline script),
// M3 of docs/douze-migration-plan.md. The tour only runs when the page carries its strings: either
// window.__aspireSiteTourStrings (as SiteTour.astro's inline script set it) or a
// <script type="application/json" id="aspire-site-tour-strings"> element (the Douze partial's way),
// rendered only when PUBLIC_ENABLE_SITE_TOUR is on.
import { bootstrapAspireSiteTour, type SiteTourStrings } from '@components/site-tour';

const siteTourWindow = window as Window & {
  __aspireSiteTourStrings?: SiteTourStrings;
};

function readStrings(): SiteTourStrings | undefined {
  if (siteTourWindow.__aspireSiteTourStrings) return siteTourWindow.__aspireSiteTourStrings;
  const element = document.getElementById('aspire-site-tour-strings');
  if (!element?.textContent) return undefined;
  try {
    return JSON.parse(element.textContent) as SiteTourStrings;
  } catch {
    return undefined;
  }
}

const strings = readStrings();
if (strings) bootstrapAspireSiteTour(strings);
