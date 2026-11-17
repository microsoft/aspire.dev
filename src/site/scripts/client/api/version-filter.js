// Ported from src/frontend/src/components/api-reference/VersionFilter.astro (plain ES module, loaded unbundled by scripts/client/api/index.js).
"use strict";
class VersionFilterController {
    container;
    btn;
    dropdown;
    checkboxes;
    allCheckbox;
    countEl;
    versions;
    storageKey;
    abortController = new AbortController();
    constructor(container) {
        this.container = container;
        const id = container.id;
        this.btn = container.querySelector(`#${id}-btn`);
        this.dropdown = container.querySelector(`#${id}-dropdown`);
        this.checkboxes = Array.from(container.querySelectorAll('.version-filter-cb:not([data-version="__all__"])'));
        this.allCheckbox = container.querySelector('.version-filter-cb[data-version="__all__"]');
        this.countEl = container.querySelector(`#${id}-count`);
        this.versions = JSON.parse(container.dataset.versions || '[]');
        this.storageKey = `version-filter-${id}`;
        this.restoreState();
        this.bindEvents();
        this.updateUI();
    }
    bindEvents() {
        const { signal } = this.abortController;
        this.btn.addEventListener('click', () => this.toggle(), { signal });
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target))
                this.close();
        }, { signal });
        this.container.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.btn.getAttribute('aria-expanded') === 'true') {
                e.stopPropagation();
                this.close();
                this.btn.focus();
            }
        }, { signal });
        this.container.addEventListener('version-filter-reset', () => {
            for (const cb of this.checkboxes)
                cb.checked = true;
            this.close();
            this.onChange();
        }, { signal });
        if (this.allCheckbox) {
            this.allCheckbox.addEventListener('change', () => {
                const checked = this.allCheckbox.checked;
                for (const cb of this.checkboxes)
                    cb.checked = checked;
                this.onChange();
            }, { signal });
        }
        for (const cb of this.checkboxes) {
            cb.addEventListener('change', () => this.onChange(), { signal });
        }
    }
    dispose() {
        this.abortController.abort();
    }
    toggle() {
        const expanded = this.btn.getAttribute('aria-expanded') === 'true';
        if (expanded)
            this.close();
        else
            this.open();
    }
    open() {
        this.btn.setAttribute('aria-expanded', 'true');
        this.dropdown.classList.add('open');
    }
    close() {
        this.btn.setAttribute('aria-expanded', 'false');
        this.dropdown.classList.remove('open');
    }
    onChange() {
        const checkedCount = this.checkboxes.filter(cb => cb.checked).length;
        if (this.allCheckbox) {
            this.allCheckbox.checked = checkedCount === this.checkboxes.length;
            this.allCheckbox.indeterminate = checkedCount > 0 && checkedCount < this.checkboxes.length;
        }
        this.updateUI();
        this.saveState();
        this.emitChange();
    }
    updateUI() {
        const checkedCount = this.checkboxes.filter(cb => cb.checked).length;
        const total = this.checkboxes.length;
        this.btn.setAttribute('aria-label', `${this.container.querySelector('.version-filter-label')?.textContent ?? 'Versions'}: ${checkedCount} of ${total} selected`);
        if (this.countEl) {
            this.countEl.textContent = `${checkedCount}/${total}`;
        }
        // Highlight button when filtered
        this.btn.classList.toggle('filtered', checkedCount < total);
        this.btn.classList.toggle('none-selected', checkedCount === 0);
    }
    saveState() {
        const selected = this.checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.version);
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(selected));
        }
        catch { }
        const url = new URL(window.location.href);
        if (selected.length === this.versions.length) {
            url.searchParams.delete('versions');
        }
        else {
            url.searchParams.set('versions', selected.join(','));
        }
        window.history.replaceState(window.history.state, '', url.toString());
    }
    restoreState() {
        const url = new URL(window.location.href);
        const urlVersions = url.searchParams.get('versions');
        let selected = null;
        if (urlVersions !== null) {
            selected = urlVersions.split(',').filter(v => this.versions.includes(v));
        }
        else {
            try {
                const stored = localStorage.getItem(this.storageKey);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed))
                        selected = parsed.filter((v) => typeof v === 'string' && this.versions.includes(v));
                }
            }
            catch { }
        }
        if (selected) {
            const selectedSet = new Set(selected);
            for (const cb of this.checkboxes) {
                cb.checked = selectedSet.has(cb.dataset.version);
            }
            if (this.allCheckbox) {
                this.allCheckbox.checked = selected.length === this.versions.length;
                this.allCheckbox.indeterminate = selected.length > 0 && selected.length < this.versions.length;
            }
        }
    }
    emitChange() {
        const selected = this.checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.version);
        this.container.dispatchEvent(new CustomEvent('version-filter-change', {
            detail: { selected, all: selected.length === this.versions.length, none: selected.length === 0 },
            bubbles: true,
        }));
    }
    getSelected() {
        return this.checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.version);
    }
}
const controllers = new Map();
/** Mounts a controller on every `.version-filter` of the page (called by index.js before the page controllers, which
 * read the restored checkbox state when they mount). */
export function initializeVersionFilters() {
    document.querySelectorAll('.version-filter').forEach((el) => {
        if (!controllers.has(el))
            controllers.set(el, new VersionFilterController(el));
    });
}
