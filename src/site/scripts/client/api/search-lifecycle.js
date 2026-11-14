// Ported from src/frontend/src/components/api-reference/search-lifecycle.ts (plain ES module, loaded unbundled by scripts/client/api/index.js).
// Every page load is a full document load on the Douze site (no Astro ClientRouter): a controller mounts once on its
// root, when the document is parsed. The AbortSignal API is kept so the controllers are unchanged; the returned
// function disposes the controller.

/**
 * @typedef {'csharp' | 'typescript'} ApiSearchLanguage
 * @typedef {'landing' | 'package' | 'module' | 'type' | 'item'} ApiSearchPageKind
 */

/**
 * Mounts a controller on its own language/page root, if the page has one.
 * @param {ApiSearchLanguage} language
 * @param {ApiSearchPageKind} pageKind
 * @param {(root: HTMLElement, signal: AbortSignal) => void} mount
 * @returns {() => void}
 */
export function registerApiSearch(language, pageKind, mount) {
    const selector = `[data-api-search-language="${language}"][data-api-search-kind="${pageKind}"]`;
    let controller = null;
    const cleanup = () => {
        controller?.abort();
        controller = null;
    };
    const init = () => {
        const root = document.querySelector(selector);
        if (!root)
            return;
        controller = new AbortController();
        mount(root, controller.signal);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    }
    else {
        init();
    }
    return () => {
        cleanup();
        document.removeEventListener('DOMContentLoaded', init);
    };
}

/**
 * Reads the JSON search index embedded in the root (`<script type="application/json" data-api-search-index>`).
 * @template T
 * @param {HTMLElement} root
 * @returns {T[]}
 */
export function readApiSearchIndex(root) {
    const indexJson = root.querySelector('[data-api-search-index]')?.textContent;
    if (!indexJson?.trim()) {
        throw new Error('API search: missing or empty search index');
    }
    return JSON.parse(indexJson);
}
