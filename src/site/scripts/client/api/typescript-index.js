// Ported from src/frontend/src/pages/reference/api/typescript/index.astro (plain ES module, loaded unbundled by scripts/client/api/index.js).
import { InpageSearchSync } from './inpage-search-sync.js';
import { readApiSearchIndex, registerApiSearch } from './search-lifecycle.js';
import { ApiSearchPresentation, withApiSearchFallback } from './search-presentation.js';
import { formatTsApiSearchStats, getTsApiSearchStats } from './ts-api-search-stats.js';
const PAGE_SIZE = 10;
const DEBOUNCE_MS = 250;
function fmtNum(n) { return n.toLocaleString(); }
const KIND_COLORS = {
    function: '#3b82f6',
    method: '#3b82f6',
    property: '#10b981',
    handle: '#8b5cf6',
    interface: '#06b6d4',
    type: '#f59e0b',
    enum: '#ef4444',
};
class TsApiSearchController {
    root;
    signal;
    input;
    resultsEl;
    packageList;
    status;
    countEl;
    filtersEl;
    clearFiltersBtn;
    index;
    debounceTimer = null;
    activeKinds = new Set();
    activeVersions = null;
    lastScored = [];
    lastTokens = [];
    visibleCount = 0;
    sync;
    presentation;
    constructor(root, signal) {
        this.root = root;
        this.signal = signal;
        this.input = root.querySelector('#ts-api-search-input');
        this.resultsEl = root.querySelector('#ts-api-search-results');
        this.packageList = root.querySelector('#ts-api-package-list');
        this.status = root.querySelector('#ts-api-search-status');
        this.countEl = root.querySelector('#ts-api-search-count');
        this.filtersEl = root.querySelector('#ts-api-kind-filters');
        this.clearFiltersBtn = root.querySelector('#ts-api-clear-filters');
        this.index = readApiSearchIndex(root);
        this.sync = new InpageSearchSync('ts-api', () => this.clear(), root, signal);
        this.presentation = new ApiSearchPresentation(root, this.input, () => this.clear(), signal);
        signal.addEventListener('abort', () => {
            if (this.debounceTimer !== null)
                clearTimeout(this.debounceTimer);
        }, { once: true });
        this.init();
        this.restoreFromUrl();
        this.syncVersionStateFromDom();
        this.filterPackageList();
        this.applySearch();
        // Listen for version filter changes
        root.addEventListener('version-filter-change', (e) => {
            const detail = e.detail;
            if (detail.all) {
                this.activeVersions = null;
            }
            else if (detail.none) {
                this.activeVersions = new Set();
            }
            else {
                this.activeVersions = new Set(detail.selected);
            }
            this.filterPackageList();
            // Show clear-filters when versions are filtered
            if (!detail.all) {
                this.clearFiltersBtn.style.display = '';
            }
            else if (this.activeKinds.size === 0) {
                this.clearFiltersBtn.style.display = 'none';
            }
            this.applySearch();
        }, { signal });
    }
    syncVersionStateFromDom() {
        const vfContainer = this.root.querySelector('.version-filter');
        if (!vfContainer) {
            this.activeVersions = null;
            return;
        }
        const versionCheckboxes = Array.from(vfContainer.querySelectorAll('.version-filter-cb:not([data-version="__all__"])'));
        const selected = versionCheckboxes.filter(cb => cb.checked).map(cb => cb.dataset.version).filter(Boolean);
        this.activeVersions = selected.length === versionCheckboxes.length
            ? null
            : new Set(selected);
        if (this.activeVersions !== null || this.activeKinds.size > 0) {
            this.clearFiltersBtn.style.display = '';
        }
    }
    getVisiblePackageStats() {
        return getTsApiSearchStats(this.index, this.activeVersions);
    }
    init() {
        this.input.addEventListener('input', () => this.handleInput(), { signal: this.signal });
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape')
                this.clear();
        }, { signal: this.signal });
        this.filtersEl.querySelectorAll('.api-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const kind = chip.dataset.kind;
                if (this.activeKinds.has(kind)) {
                    this.activeKinds.delete(kind);
                    chip.classList.remove('active');
                    chip.setAttribute('aria-pressed', 'false');
                }
                else {
                    this.activeKinds.add(kind);
                    chip.classList.add('active');
                    chip.setAttribute('aria-pressed', 'true');
                }
                this.clearFiltersBtn.style.display = this.activeKinds.size > 0 ? '' : 'none';
                this.syncUrl();
                this.applySearch();
            }, { signal: this.signal });
        });
        // Clear filters (kinds + versions)
        this.clearFiltersBtn.addEventListener('click', () => {
            this.activeKinds.clear();
            this.filtersEl.querySelectorAll('.api-filter-chip').forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-pressed', 'false');
            });
            // Let the version controller restore and persist its own defaults.
            this.activeVersions = null;
            const vfContainer = this.root.querySelector('.version-filter');
            vfContainer?.dispatchEvent(new Event('version-filter-reset'));
            this.filterPackageList();
            this.clearFiltersBtn.style.display = 'none';
            this.syncUrl();
            this.applySearch();
            this.input.focus();
        }, { signal: this.signal });
    }
    clear() {
        this.input.value = '';
        this.sync.updateClearButton();
        this.syncUrl();
        this.applySearch();
        this.input.focus();
    }
    showPackages() {
        if (this.activeKinds.size > 0 || this.getVisiblePackageStats().packageCount === 0) {
            this.search('');
            return;
        }
        this.resultsEl.style.display = 'none';
        this.resultsEl.innerHTML = '';
        this.packageList.style.display = '';
        this.countEl.textContent = formatTsApiSearchStats(this.getVisiblePackageStats());
        this.status.textContent = this.countEl.textContent;
    }
    handleInput() {
        if (this.debounceTimer)
            clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => {
            this.syncUrl();
            this.applySearch();
        }, DEBOUNCE_MS);
    }
    syncUrl() {
        this.sync.writeUrl(this.input.value.trim(), this.activeKinds);
    }
    restoreFromUrl() {
        const q = this.sync.readQuery();
        const validKinds = new Set(Array.from(this.filtersEl.querySelectorAll('.api-filter-chip'))
            .map(c => c.dataset.kind));
        const kinds = this.sync.readKinds(validKinds);
        // Text typed before the controller mounted (it is imported once the page is parsed) is kept, and recorded in
        // the url below like text typed afterwards.
        const typedBeforeMount = !q && this.input.value.trim() !== '';
        if (q) {
            this.input.value = q;
            this.sync.updateClearButton();
        }
        if (kinds.size > 0) {
            this.activeKinds = kinds;
            this.filtersEl.querySelectorAll('.api-filter-chip').forEach(chip => {
                const kind = chip.dataset.kind;
                if (kinds.has(kind)) {
                    chip.classList.add('active');
                    chip.setAttribute('aria-pressed', 'true');
                }
            });
            this.clearFiltersBtn.style.display = '';
        }
        if (typedBeforeMount)
            this.syncUrl();
    }
    applySearch() {
        if (this.debounceTimer !== null)
            clearTimeout(this.debounceTimer);
        this.presentation.update(this.activeKinds.size > 0 || this.activeVersions !== null);
        const q = this.input.value.trim();
        if (!q && this.activeKinds.size === 0) {
            this.showPackages();
            return;
        }
        this.search(q);
    }
    showSearchResults() {
        this.packageList.style.display = 'none';
        this.resultsEl.style.display = '';
        this.search(this.input.value.trim());
    }
    filterPackageList() {
        if (!this.packageList)
            return;
        const items = this.packageList.querySelectorAll('.api-list-item[data-version]');
        for (const item of items) {
            const version = item.dataset.version;
            if (this.activeVersions && version && !this.activeVersions.has(version)) {
                item.style.display = 'none';
            }
            else {
                item.style.display = '';
            }
        }
    }
    findMatches(query, kinds = this.activeKinds, versions = this.activeVersions) {
        const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        const hasKindFilter = kinds.size > 0;
        const hasVersionFilter = versions !== null;
        const scored = [];
        for (const entry of this.index) {
            if (hasKindFilter && !kinds.has(entry.k))
                continue;
            if (hasVersionFilter && entry.v && !versions.has(entry.v))
                continue;
            if (tokens.length === 0) {
                scored.push({ entry, score: 50 });
                continue;
            }
            const nameLower = entry.n.toLowerCase();
            const fullLower = entry.f.toLowerCase();
            const descLower = entry.s.toLowerCase();
            const pkgLower = entry.p.toLowerCase();
            const parentLower = entry.t?.toLowerCase() ?? '';
            let score = 0;
            for (const token of tokens) {
                if (nameLower === token)
                    score += 100;
                else if (nameLower.startsWith(token))
                    score += 60;
                else if (nameLower.includes(token))
                    score += 40;
                else if (this.camelMatch(entry.n, token))
                    score += 55;
                else if (fullLower.includes(token))
                    score += 30;
                else if (parentLower.includes(token))
                    score += 25;
                else if (pkgLower.includes(token))
                    score += 15;
                else if (descLower.includes(token))
                    score += 10;
                else {
                    score = 0;
                    break;
                }
            }
            if (score > 0)
                scored.push({ entry, score });
        }
        return scored;
    }
    search(query) {
        const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        const hasKindFilter = this.activeKinds.size > 0;
        const hasVersionFilter = this.activeVersions !== null;
        const scored = this.findMatches(query);
        scored.sort((a, b) => b.score - a.score || a.entry.n.localeCompare(b.entry.n));
        this.lastScored = scored;
        this.lastTokens = tokens;
        this.visibleCount = 0;
        this.packageList.style.display = 'none';
        this.resultsEl.style.display = '';
        if (scored.length === 0) {
            this.presentation.renderEmpty(this.resultsEl, hasKindFilter || hasVersionFilter, this.index.length === 0, {
                withoutQuery: this.findMatches('').length,
                // Clear filters restores the version controller's all-supported-versions default.
                withoutFilters: this.findMatches(query, new Set(), null).length,
            }, this.activeKinds, this.activeVersions);
            this.countEl.textContent = '0 results';
            this.status.textContent = this.countEl.textContent;
            return;
        }
        this.resultsEl.innerHTML = '';
        this.loadMore();
    }
    loadMore() {
        const total = this.lastScored.length;
        const nextBatch = this.lastScored.slice(this.visibleCount, this.visibleCount + PAGE_SIZE);
        this.visibleCount += nextBatch.length;
        const existingBtn = this.resultsEl.querySelector('.api-load-more');
        if (existingBtn)
            existingBtn.remove();
        const fragment = document.createDocumentFragment();
        for (const s of nextBatch) {
            const div = document.createElement('div');
            div.innerHTML = this.renderResult(s.entry, this.lastTokens);
            while (div.firstChild)
                fragment.appendChild(div.firstChild);
        }
        this.resultsEl.appendChild(fragment);
        this.countEl.textContent = this.visibleCount < total
            ? `Showing ${fmtNum(this.visibleCount)} of ${fmtNum(total)} results`
            : `${fmtNum(total)} result${total !== 1 ? 's' : ''}`;
        const remaining = total - this.visibleCount;
        if (remaining > 0) {
            const btn = document.createElement('button');
            btn.className = 'api-load-more';
            btn.type = 'button';
            btn.textContent = `Show ${fmtNum(Math.min(remaining, PAGE_SIZE))} more of ${fmtNum(remaining)} remaining`;
            btn.addEventListener('click', () => this.loadMore(), { signal: this.signal });
            this.resultsEl.appendChild(btn);
        }
    }
    renderResult(entry, tokens) {
        const kindColor = KIND_COLORS[entry.k] ?? KIND_COLORS['method'];
        const kindClass = entry.k.replace(/\s+/g, '-');
        return `<a href="${this.esc(entry.h)}" class="api-list-item api-search-result" title="${this.esc(entry.f)} — ${this.esc(entry.p)}${entry.t ? ` (${this.esc(entry.t)})` : ''}">
      <div class="api-list-header">
        <span class="api-result-name-wrap">
          <span class="api-search-result-name" style="color: ${kindColor}">${this.highlight(entry.n, tokens)}</span>
          ${entry.t ? `<span class="api-result-dot">&nbsp;·&nbsp;</span><span class="api-result-parent">${this.esc(entry.t)}</span>` : ''}
        </span>
        <span class="api-kind-micro kind-${kindClass}">${this.esc(entry.k)}</span>
        <div class="trailing">
          <span class="api-list-meta" title="${this.esc(entry.p)}">${this.esc(entry.p)}</span>
        </div>
      </div>
      ${entry.s ? `<div class="api-list-desc">${this.esc(entry.s)}</div>` : ''}
    </a>`;
    }
    highlight(text, tokens) {
        if (!tokens.length)
            return this.esc(text);
        const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const re = new RegExp(`(${escaped.join('|')})`, 'gi');
        return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
            .replace(re, '<mark>$1</mark>');
    }
    camelMatch(name, token) {
        const uppers = name.replace(/[^A-Z]/g, '').toLowerCase();
        return uppers.length >= 2 && (uppers.startsWith(token) || uppers.includes(token));
    }
    esc(text) {
        return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
    }
}
registerApiSearch('typescript', 'landing', withApiSearchFallback((root, signal) => {
    new TsApiSearchController(root, signal);
    const input = root.querySelector('#ts-api-search-input');
    input?.focus();
}));
