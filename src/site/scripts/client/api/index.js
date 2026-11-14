// The API reference client entry, loaded by templates/layouts/api.liquid as
//   <script type="module" src="/scripts/client/api/index.js"></script>
// Plain ES modules, loaded unbundled (relative imports with the .js extension). When the site's esbuild bundle
// (scripts/build-client.mjs, scripts/client/site.ts) takes over, site.ts can import this file instead.
//
// Once the document is parsed: the component scripts run first (the version filters restore their checkboxes from
// the url or localStorage, which the landing controllers read when they mount), then the controller of each search
// root on the page is imported; it mounts itself through registerApiSearch (search-lifecycle.js).

import { initializeVersionFilters } from './version-filter.js';
import { initializeMemberOverviewRows } from './member-overview-list.js';

/** `data-api-search-language`/`data-api-search-kind` of a search root -> its controller module. */
const controllers = {
    'csharp/landing': () => import('./csharp-index.js'),
    'csharp/package': () => import('./csharp-package.js'),
    'csharp/type': () => import('./csharp-type.js'),
    'typescript/landing': () => import('./typescript-index.js'),
    'typescript/module': () => import('./typescript-module.js'),
    'typescript/item': () => import('./typescript-item.js'),
};

/**
 * A theme switch (`<html data-theme>`) restyles the search controls at once: their hover/active color transitions
 * would otherwise animate from the old theme's colors, leaving low-contrast intermediate states on screen.
 */
function snapThemeChanges() {
    new MutationObserver(() => {
        const style = document.createElement('style');
        style.textContent = '.api-search-bar-unified, .api-search-bar-unified * { transition: none !important; }';
        document.head.append(style);
        void document.documentElement.offsetWidth;
        style.remove();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function start() {
    snapThemeChanges();
    initializeVersionFilters();
    if (document.querySelector('[data-member-href]'))
        initializeMemberOverviewRows();
    const keys = new Set();
    for (const root of document.querySelectorAll('[data-api-search-language][data-api-search-kind]')) {
        keys.add(`${root.dataset.apiSearchLanguage}/${root.dataset.apiSearchKind}`);
    }
    for (const key of keys) {
        const load = controllers[key];
        if (!load) {
            console.warn(`[api] no search controller for ${key}`);
            continue;
        }
        load().catch((error) => console.error(`[api] failed to load the search controller for ${key}`, error));
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
}
else {
    start();
}
