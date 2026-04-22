/**
 * InpageSearchSync — URL query-string ↔ search-state synchronization.
 *
 * Provides helpers to read/write `?q=` (search text) and `?kinds=`
 * (comma-separated active filter kinds) to the URL so users can
 * share deep-links to filtered/searched views.
 *
 * Also wires up the embedded clear (×) button in the search input.
 */
declare global {
  interface Window {
    InpageSearchSync: typeof InpageSearchSync;
  }
}

class InpageSearchSync {
  private input: HTMLInputElement;
  private clearBtn: HTMLElement;
  private onClear: () => void;

  constructor(prefix: string, onClear: () => void) {
    const input = document.getElementById(`${prefix}-search-input`);
    const clearBtn = document.getElementById(`${prefix}-search-clear`);
    if (!(input instanceof HTMLInputElement) || !clearBtn) {
      throw new Error(`InpageSearchSync: missing elements for prefix "${prefix}"`);
    }
    this.input = input;
    this.clearBtn = clearBtn;
    this.onClear = onClear;

    this.input.addEventListener('input', () => this.updateClearButton());
    this.clearBtn.addEventListener('click', () => {
      this.input.value = '';
      this.updateClearButton();
      this.input.focus();
      this.onClear();
    });
  }

  readQuery(): string {
    return new URLSearchParams(window.location.search).get('q') ?? '';
  }

  readKinds(validKinds: Set<string>): Set<string> {
    const raw = new URLSearchParams(window.location.search).get('kinds') ?? '';
    if (!raw) return new Set();
    const kinds = new Set<string>();
    for (const k of raw.split(',')) {
      const trimmed = k.trim();
      if (trimmed && validKinds.has(trimmed)) kinds.add(trimmed);
    }
    return kinds;
  }

  writeUrl(query: string, activeKinds: Set<string>): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    url.searchParams.delete('kinds');

    if (query) url.searchParams.set('q', query);
    if (activeKinds.size > 0) url.searchParams.set('kinds', [...activeKinds].join(','));

    const hasParams = url.searchParams.toString().length > 0;
    const target = hasParams
      ? `${url.pathname}?${url.searchParams}${url.hash}`
      : `${url.pathname}${url.hash}`;
    if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      history.replaceState(null, '', target);
    }
  }

  updateClearButton(): void {
    this.clearBtn.style.display = this.input.value.length > 0 ? '' : 'none';
  }
}

// Expose globally for controller scripts
window.InpageSearchSync = InpageSearchSync;
