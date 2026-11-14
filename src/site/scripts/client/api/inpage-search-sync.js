// Ported from src/frontend/src/components/api-reference/inpage-search-sync.ts (plain ES module, loaded unbundled by scripts/client/api/index.js).
export class InpageSearchSync {
    signal;
    input;
    clearBtn;
    onClear;
    constructor(prefix, onClear, root = document, signal) {
        this.signal = signal;
        const input = root.querySelector(`#${prefix}-search-input`);
        const clearBtn = root.querySelector(`#${prefix}-search-clear`);
        if (!(input instanceof HTMLInputElement) || !clearBtn) {
            throw new Error(`InpageSearchSync: missing elements for prefix "${prefix}"`);
        }
        this.input = input;
        this.clearBtn = clearBtn;
        this.onClear = onClear;
        this.input.addEventListener('input', () => this.updateClearButton(), { signal });
        this.clearBtn.addEventListener('click', () => {
            this.input.value = '';
            this.updateClearButton();
            this.input.focus();
            this.onClear();
        }, { signal });
        // Text can be entered or restored before the controller attaches its listeners.
        this.updateClearButton();
    }
    readQuery() {
        return new URLSearchParams(window.location.search).get('q') ?? '';
    }
    readKinds(validKinds) {
        const raw = new URLSearchParams(window.location.search).get('kinds') ?? '';
        if (!raw)
            return new Set();
        const kinds = new Set();
        for (const k of raw.split(',')) {
            const trimmed = k.trim();
            if (trimmed && validKinds.has(trimmed))
                kinds.add(trimmed);
        }
        return kinds;
    }
    writeUrl(query, activeKinds) {
        if (this.signal?.aborted || !this.input.isConnected)
            return;
        const url = new URL(window.location.href);
        url.searchParams.delete('q');
        url.searchParams.delete('kinds');
        if (query)
            url.searchParams.set('q', query);
        if (activeKinds.size > 0)
            url.searchParams.set('kinds', [...activeKinds].join(','));
        const hasParams = url.searchParams.toString().length > 0;
        const target = hasParams
            ? `${url.pathname}?${url.searchParams}${url.hash}`
            : `${url.pathname}${url.hash}`;
        if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
            history.replaceState(history.state, '', target);
        }
    }
    updateClearButton() {
        this.clearBtn.style.display = this.input.value.length > 0 ? '' : 'none';
    }
}
// Expose globally for controller scripts
window.InpageSearchSync = InpageSearchSync;
