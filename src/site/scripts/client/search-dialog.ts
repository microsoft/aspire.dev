// Ported from src/frontend/node_modules/@astrojs/starlight/components/Search.astro (<script> and the
// is:inline platform key script), Starlight 0.41.3 with the site's pnpm patch, M3 of
// docs/douze-migration-plan.md.
//
// Differences from Starlight:
// - Pagefind UI is the bundle Pagefind writes next to the index (/pagefind/pagefind-ui.js, which defines
//   window.PagefindUI) instead of the @pagefind/default-ui npm module bundled by Vite. It is loaded when
//   the browser is idle, as Starlight does, so results are ready when the dialog opens; opening the dialog
//   before that loads it at once.
// - The patch's re-initialization across ClientRouter swaps is gone (full page loads).
// - `pagefindUserConfig` (virtual module) is empty for this site (pagefind: true in astro.config.mjs).
// - The translations come from the data-translations attribute of <site-search> (JSON), as in Starlight.

interface PagefindUIInstance {
  destroy?(): void;
}
type PagefindUIConstructor = new (options: Record<string, unknown>) => PagefindUIInstance;

declare global {
  interface Window {
    PagefindUI?: PagefindUIConstructor;
  }
}

const PAGEFIND_UI_URL = '/pagefind/pagefind-ui.js';
let pagefindUILoad: Promise<PagefindUIConstructor | undefined> | undefined;

function loadPagefindUI(): Promise<PagefindUIConstructor | undefined> {
  pagefindUILoad ??= new Promise((resolve) => {
    if (window.PagefindUI) {
      resolve(window.PagefindUI);
      return;
    }
    const script = document.createElement('script');
    script.src = PAGEFIND_UI_URL;
    script.async = true;
    script.onload = () => resolve(window.PagefindUI);
    script.onerror = () => {
      console.warn(`[search] could not load ${PAGEFIND_UI_URL}: run Pagefind on the built site.`);
      resolve(undefined);
    };
    document.head.append(script);
  });
  return pagefindUILoad;
}

/** Shows ⌘ instead of Ctrl on Apple platforms (Starlight's is:inline script). */
function updatePlatformKey(root: ParentNode): void {
  const openBtn = root.querySelector('button[data-open-modal]');
  const shortcut = openBtn?.querySelector('kbd');
  if (!openBtn || !(shortcut instanceof HTMLElement)) return;
  const platformKey = shortcut.querySelector('kbd');
  if (platformKey && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
    platformKey.textContent = '⌘';
    openBtn.setAttribute('aria-keyshortcuts', 'Meta+K');
  }
  shortcut.style.display = '';
}

class SiteSearch extends HTMLElement {
  private cleanup?: () => void;

  connectedCallback() {
    this.cleanup?.();
    const controller = new AbortController();
    const { signal } = controller;
    let pagefindUI: PagefindUIInstance | undefined;
    let searchStarted = false;
    const openBtn = this.querySelector<HTMLButtonElement>('button[data-open-modal]');
    const closeBtn = this.querySelector<HTMLButtonElement>('button[data-close-modal]');
    const dialog = this.querySelector('dialog');
    const dialogFrame = this.querySelector('.dialog-frame');
    if (!openBtn || !closeBtn || !dialog || !dialogFrame) return;

    updatePlatformKey(this);

    /** Close the modal if a user clicks on a link or outside of the modal. */
    const onClick = (event: MouseEvent) => {
      const isLink = 'href' in (event.target || {});
      if (
        isLink ||
        (document.body.contains(event.target as Node) && !dialogFrame.contains(event.target as Node))
      ) {
        closeModal();
      }
    };

    const openModal = (event?: MouseEvent) => {
      dialog.showModal();
      document.body.toggleAttribute('data-search-modal-open', true);
      this.querySelector('input')?.focus();
      event?.stopPropagation();
      window.addEventListener('click', onClick, { signal });
      startSearch();
    };

    const closeModal = () => dialog.close();

    openBtn.addEventListener('click', openModal, { signal });
    openBtn.disabled = false;
    closeBtn.addEventListener('click', closeModal, { signal });

    dialog.addEventListener(
      'close',
      () => {
        document.body.toggleAttribute('data-search-modal-open', false);
        window.removeEventListener('click', onClick);
      },
      { signal }
    );

    // Listen for `ctrl + k` and `cmd + k` keyboard shortcuts.
    window.addEventListener(
      'keydown',
      (e) => {
        if ((e.metaKey === true || e.ctrlKey === true) && e.key === 'k') {
          dialog.open ? closeModal() : openModal();
          e.preventDefault();
        }
      },
      { signal }
    );

    this.cleanup = () => {
      controller.abort();
      if (dialog.open) {
        closeModal();
        document.body.toggleAttribute('data-search-modal-open', false);
      }
      pagefindUI?.destroy?.();
    };

    let translations = {};
    try {
      translations = JSON.parse(this.dataset.translations || '{}');
    } catch {}

    const shouldStrip = this.dataset.stripTrailingSlash !== undefined;
    const stripTrailingSlash = (path: string) => path.replace(/(.)\/(#.*)?$/, '$1$2');
    const formatURL = shouldStrip ? stripTrailingSlash : (path: string) => path;

    const startSearch = () => {
      if (searchStarted) return;
      searchStarted = true;
      void loadPagefindUI().then((PagefindUI) => {
        if (!PagefindUI || signal.aborted) return;
        pagefindUI = new PagefindUI({
          element: this.querySelector('#starlight__search'),
          baseUrl: '/',
          bundlePath: '/pagefind/',
          showImages: false,
          translations,
          showSubResults: true,
          processResult: (result: { url: string; sub_results: Array<{ url: string }> }) => {
            result.url = formatURL(result.url);
            result.sub_results = result.sub_results.map((sub_result) => {
              sub_result.url = formatURL(sub_result.url);
              return sub_result;
            });
          },
        });
        if (dialog.open) this.querySelector('input')?.focus();
      });
    };

    const onIdle = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1));
    onIdle(() => {
      if (!signal.aborted) startSearch();
    });
  }

  disconnectedCallback() {
    this.cleanup?.();
    this.cleanup = undefined;
  }
}

if (!customElements.get('site-search')) customElements.define('site-search', SiteSearch);
export {};
