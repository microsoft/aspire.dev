// Ported from src/frontend/src/pages/reference/api/typescript/[module]/index.astro (plain ES module, loaded unbundled by scripts/client/api/index.js).
import { InpageSearchSync } from './inpage-search-sync.js';
import { readApiSearchIndex, registerApiSearch } from './search-lifecycle.js';
import { ApiSearchPresentation, withApiSearchFallback } from './search-presentation.js';
const PAGE_SIZE = 10;
const DEBOUNCE_MS = 200;
/** Format a number with locale-aware grouping (e.g. 1,234). */
function fmtNum(n) { return n.toLocaleString(); }
const KIND_COLORS = {
    'handle': 'var(--api-kind-class)',
    'interface': 'var(--api-kind-interface)',
    'type': 'var(--api-kind-struct)',
    'enum': 'var(--api-kind-enum)',
    'function': '#3b82f6',
    'method': '#3b82f6',
    'property': '#10b981',
};
const TYPE_KINDS = new Set(['handle', 'interface', 'type', 'enum']);
class PkgSearchController {
    signal;
    input;
    resultsEl;
    nsList;
    status;
    countEl;
    filtersEl;
    clearFiltersBtn;
    index;
    base;
    pkgName;
    debounceTimer = null;
    typeCount;
    memberCount;
    activeKinds = new Set();
    lastScored = [];
    lastTokens = [];
    visibleCount = 0;
    sync;
    presentation;
    constructor(root, signal) {
        this.signal = signal;
        this.input = root.querySelector('#pkg-search-input');
        this.resultsEl = root.querySelector('#pkg-search-results');
        this.nsList = document.getElementById('pkg-namespace-list');
        this.status = root.querySelector('#pkg-search-status');
        this.countEl = root.querySelector('#pkg-search-count');
        this.filtersEl = root.querySelector('#pkg-kind-filters');
        this.clearFiltersBtn = root.querySelector('#pkg-clear-filters');
        this.index = readApiSearchIndex(root);
        this.base = root.dataset.base ?? '';
        this.pkgName = root.dataset.packageName ?? '';
        this.typeCount = Number(root.dataset.typeCount ?? 0);
        this.memberCount = Number(root.dataset.memberCount ?? 0);
        this.sync = new InpageSearchSync('pkg', () => this.clear(), root, signal);
        this.presentation = new ApiSearchPresentation(root, this.input, () => this.clear(), signal);
        signal.addEventListener('abort', () => {
            if (this.debounceTimer !== null)
                clearTimeout(this.debounceTimer);
        }, { once: true });
        this.init();
        this.restoreFromUrl();
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
        this.clearFiltersBtn.addEventListener('click', () => {
            this.activeKinds.clear();
            this.filtersEl.querySelectorAll('.api-filter-chip').forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-pressed', 'false');
            });
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
    showNamespaces() {
        if (this.activeKinds.size > 0 || this.index.length === 0) {
            this.search('');
            return;
        }
        this.resultsEl.style.display = 'none';
        this.resultsEl.innerHTML = '';
        this.nsList.style.display = '';
        this.countEl.textContent = `${fmtNum(this.typeCount)} types and ${fmtNum(this.memberCount)} members`;
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
        this.applySearch();
        if (typedBeforeMount)
            this.syncUrl();
    }
    applySearch() {
        if (this.debounceTimer !== null)
            clearTimeout(this.debounceTimer);
        this.presentation.update(this.activeKinds.size > 0);
        const q = this.input.value.trim();
        if (!q && this.activeKinds.size === 0) {
            this.showNamespaces();
            return;
        }
        this.search(q);
    }
    findMatches(query, kinds = this.activeKinds) {
        const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        const hasKindFilter = kinds.size > 0;
        const scored = [];
        for (const entry of this.index) {
            if (hasKindFilter && !kinds.has(entry.k))
                continue;
            if (tokens.length === 0) {
                scored.push({ entry, score: 50 });
                continue;
            }
            const nameLower = entry.n.toLowerCase();
            const fullLower = entry.f.toLowerCase();
            const nsLower = entry.ns.toLowerCase();
            const summaryLower = entry.s.toLowerCase();
            const parentLower = entry.t?.toLowerCase() ?? '';
            let score = 0;
            for (const token of tokens) {
                if (nameLower === token) {
                    score += 100;
                }
                else if (nameLower.startsWith(token)) {
                    score += 60;
                }
                else if (nameLower.includes(token)) {
                    score += 40;
                }
                else if (this.camelMatch(entry.n, token)) {
                    score += 55;
                }
                else if (fullLower.includes(token)) {
                    score += 30;
                }
                else if (parentLower.includes(token)) {
                    score += 25;
                }
                else if (nsLower.includes(token)) {
                    score += 20;
                }
                else if (summaryLower.includes(token)) {
                    score += 10;
                }
                else {
                    score = 0;
                    break;
                }
            }
            if (score > 0 && !entry.t)
                score += 5;
            if (score > 0)
                scored.push({ entry, score });
        }
        return scored;
    }
    search(query) {
        const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        const hasKindFilter = this.activeKinds.size > 0;
        const scored = this.findMatches(query);
        scored.sort((a, b) => b.score - a.score || a.entry.n.localeCompare(b.entry.n));
        this.lastScored = scored;
        this.lastTokens = tokens;
        this.visibleCount = 0;
        const total = scored.length;
        this.nsList.style.display = 'none';
        this.resultsEl.style.display = '';
        if (total === 0) {
            this.presentation.renderEmpty(this.resultsEl, hasKindFilter, this.index.length === 0, {
                withoutQuery: this.findMatches('').length,
                withoutFilters: this.findMatches(query, new Set()).length,
            }, this.activeKinds);
            this.countEl.textContent = '0 results';
            this.status.textContent = 'No results';
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
        this.status.textContent = this.countEl.textContent ?? '';
        const remaining = total - this.visibleCount;
        if (remaining > 0) {
            const btn = document.createElement('button');
            btn.className = 'api-load-more';
            btn.type = 'button';
            const nextCount = Math.min(remaining, PAGE_SIZE);
            btn.textContent = `Show ${fmtNum(nextCount)} more of ${fmtNum(remaining)} remaining`;
            btn.addEventListener('click', () => this.loadMore(), { signal: this.signal });
            this.resultsEl.appendChild(btn);
        }
    }
    renderResult(entry, tokens) {
        const isMember = !!entry.t;
        const isType = TYPE_KINDS.has(entry.k);
        const kindClass = `kind-${entry.k.replace(/\s+/g, '-')}`;
        const kindColor = KIND_COLORS[entry.k] ?? KIND_COLORS['handle'];
        const href = entry.h ?? null;
        const parentInfo = isMember
            ? `<span class="api-result-parent">${this.esc(entry.t)}</span><span class="api-result-dot">.</span>`
            : '';
        const fullName = isMember ? `${entry.t}.${entry.n}` : entry.n;
        const tag = href ? 'a' : 'div';
        const hrefAttr = href ? ` href="${this.esc(href)}"` : '';
        return `<${tag}${hrefAttr} class="api-list-item api-search-result" title="${this.esc(fullName)}">
      <div class="api-list-header">
        <span class="api-result-name-wrap" title="${this.esc(fullName)}">
          ${parentInfo}<span class="api-search-result-name" style="color: ${kindColor}">${this.highlight(entry.n, tokens)}</span>
        </span>
        <span class="api-kind-micro ${kindClass}">${this.esc(entry.k)}</span>
        <div class="trailing">
          <span class="api-list-meta">${this.esc(entry.ns)}</span>
        </div>
      </div>
      ${entry.s ? `<div class="api-list-desc">${this.esc(entry.s)}</div>` : ''}
    </${tag}>`;
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
        if (uppers.length < 2)
            return false;
        return uppers.startsWith(token) || uppers.includes(token);
    }
    esc(text) {
        return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
    }
}
registerApiSearch('typescript', 'module', withApiSearchFallback((root, signal) => new PkgSearchController(root, signal)));
