// Replaces Astro's `prefetch` (astro.config.mjs `prefetch: true`, default strategy 'hover'): prefetches a
// same-origin page when the pointer rests on, or focus moves to, a link to it. Uses a Speculation Rules
// `prefetch` rule where the browser supports it, else a <link rel="prefetch">. Links opt out with
// data-astro-prefetch="false" or data-no-prefetch, like Astro's.
const prefetched = new Set<string>();
const supportsSpeculationRules =
  typeof HTMLScriptElement !== 'undefined' &&
  typeof HTMLScriptElement.supports === 'function' &&
  HTMLScriptElement.supports('speculationrules');

function shouldPrefetch(link: HTMLAnchorElement): string | null {
  if (!link.href || link.target === '_blank' || link.hasAttribute('download')) return null;
  if (link.dataset.astroPrefetch === 'false' || link.hasAttribute('data-no-prefetch')) return null;
  let url: URL;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
  if (url.pathname === location.pathname && url.search === location.search) return null;
  url.hash = '';
  const key = url.href;
  if (prefetched.has(key)) return null;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return null;
  return key;
}

function prefetch(href: string): void {
  prefetched.add(href);
  if (supportsSpeculationRules) {
    const script = document.createElement('script');
    script.type = 'speculationrules';
    script.textContent = JSON.stringify({ prefetch: [{ source: 'list', urls: [href] }] });
    document.head.append(script);
  } else {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    document.head.append(link);
  }
}

let hoverTimer: ReturnType<typeof setTimeout> | undefined;

function onIntent(event: Event, delay: number): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return;
  const href = shouldPrefetch(link);
  if (!href) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => prefetch(href), delay);
}

document.addEventListener('pointerover', (event) => onIntent(event, 80), { passive: true });
document.addEventListener('focusin', (event) => onIntent(event, 0), { passive: true });
document.addEventListener('pointerout', () => clearTimeout(hoverTimer), { passive: true });
export {};
