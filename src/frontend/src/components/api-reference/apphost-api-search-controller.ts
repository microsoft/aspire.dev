import {
  formatAppHostApiSearchStats,
  getAppHostApiSearchStats,
} from '@utils/apphost-api-search-stats';
import type { AppHostApiSearchEntry } from '@utils/apphost-api-search';
import type { AppHostLanguageId } from '@utils/apphost-languages';

import { InpageSearchSync } from './inpage-search-sync';

declare global {
  interface Window {
    __appHostApiSearchIndex?: AppHostApiSearchEntry[];
    __appHostApiLanguageIds?: AppHostLanguageId[];
  }
}

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 250;
const KIND_COLORS: Record<string, string> = {
  function: '#3b82f6',
  method: '#3b82f6',
  property: '#10b981',
  handle: '#8b5cf6',
  interface: '#06b6d4',
  dto: '#f59e0b',
  enum: '#ef4444',
  value: '#ec4899',
};

class AppHostApiSearchController {
  private readonly input = requiredElement<HTMLInputElement>('apphost-api-search-input');
  private readonly results = requiredElement<HTMLElement>('apphost-api-search-results');
  private readonly packages = requiredElement<HTMLElement>('apphost-api-package-list');
  private readonly status = requiredElement<HTMLElement>('apphost-api-search-status');
  private readonly count = requiredElement<HTMLElement>('apphost-api-search-count');
  private readonly filters = requiredElement<HTMLElement>('apphost-api-kind-filters');
  private readonly clearFilters = requiredElement<HTMLElement>('apphost-api-clear-filters');
  private readonly index = window.__appHostApiSearchIndex ?? [];
  private readonly languageIds = window.__appHostApiLanguageIds ?? ['typescript'];
  private readonly sync = new InpageSearchSync('apphost-api', () => this.clear());
  private activeKinds = new Set<string>();
  private activeVersions: Set<string> | null = null;
  private scored: Array<{ entry: AppHostApiSearchEntry; score: number }> = [];
  private tokens: string[] = [];
  private visibleCount = 0;
  private debounceTimer: number | undefined;

  constructor() {
    this.bindEvents();
    this.restoreFromUrl();
    this.syncVersionStateFromDom();
    this.filterPackages();
    this.applySearch();
  }

  private activeLanguage(): AppHostLanguageId {
    const selected = document.documentElement.dataset.apphostLang as AppHostLanguageId | undefined;
    return selected && this.languageIds.includes(selected) ? selected : this.languageIds[0];
  }

  private bindEvents(): void {
    this.input.addEventListener('input', () => {
      if (this.debounceTimer !== undefined) window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => {
        this.syncUrl();
        this.applySearch();
      }, DEBOUNCE_MS);
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.clear();
    });

    this.filters.querySelectorAll<HTMLElement>('.api-filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const kind = chip.dataset.kind;
        if (!kind) return;
        if (this.activeKinds.delete(kind)) {
          chip.classList.remove('active');
          chip.setAttribute('aria-pressed', 'false');
        } else {
          this.activeKinds.add(kind);
          chip.classList.add('active');
          chip.setAttribute('aria-pressed', 'true');
        }
        this.updateClearFiltersVisibility();
        this.syncUrl();
        this.applySearch();
      });
    });

    this.clearFilters.addEventListener('click', () => this.resetFilters());
    document.addEventListener('version-filter-change', (event) => {
      const detail = (event as CustomEvent<{
        all?: boolean;
        none?: boolean;
        selected?: string[];
      }>).detail;
      this.activeVersions = detail.all
        ? null
        : new Set(detail.none ? [] : (detail.selected ?? []));
      this.filterPackages();
      this.updateClearFiltersVisibility();
      this.applySearch();
    });

    const refreshLanguage = (): void => {
      window.requestAnimationFrame(() => {
        this.filterPackages();
        this.applySearch();
      });
    };
    window.addEventListener('apphost-language-change', refreshLanguage);
    window.addEventListener('apphost-language-select', refreshLanguage);
  }

  private restoreFromUrl(): void {
    const query = this.sync.readQuery();
    const validKinds = new Set(
      [...this.filters.querySelectorAll<HTMLElement>('.api-filter-chip')]
        .map((chip) => chip.dataset.kind)
        .filter((kind): kind is string => Boolean(kind))
    );
    const kinds = this.sync.readKinds(validKinds);

    if (query) {
      this.input.value = query;
      this.sync.updateClearButton();
    }
    if (kinds.size > 0) {
      this.activeKinds = kinds;
      this.filters.querySelectorAll<HTMLElement>('.api-filter-chip').forEach((chip) => {
        if (chip.dataset.kind && kinds.has(chip.dataset.kind)) {
          chip.classList.add('active');
          chip.setAttribute('aria-pressed', 'true');
        }
      });
    }
  }

  private syncVersionStateFromDom(): void {
    const checkboxes = [
      ...document.querySelectorAll<HTMLInputElement>(
        '.version-filter .version-filter-cb:not([data-version="__all__"])'
      ),
    ];
    const selected = checkboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.dataset.version)
      .filter((version): version is string => Boolean(version));
    this.activeVersions = checkboxes.length === selected.length ? null : new Set(selected);
    this.updateClearFiltersVisibility();
  }

  private resetFilters(): void {
    this.activeKinds.clear();
    this.filters.querySelectorAll<HTMLElement>('.api-filter-chip').forEach((chip) => {
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    });
    this.activeVersions = null;

    const versionFilter = document.querySelector('.version-filter');
    versionFilter?.querySelectorAll<HTMLInputElement>('.version-filter-cb').forEach((checkbox) => {
      checkbox.checked = true;
      checkbox.indeterminate = false;
    });
    const versionCount = versionFilter?.querySelector<HTMLElement>('[id$="-count"]');
    const total = versionFilter?.querySelectorAll(
      '.version-filter-cb:not([data-version="__all__"])'
    ).length ?? 0;
    if (versionCount) versionCount.textContent = `${total}/${total}`;
    versionFilter?.querySelector('.version-filter-btn')?.classList.remove('filtered', 'none-selected');

    this.updateClearFiltersVisibility();
    this.filterPackages();
    this.syncUrl();
    this.applySearch();
  }

  private clear(): void {
    this.input.value = '';
    this.sync.updateClearButton();
    this.syncUrl();
    this.applySearch();
  }

  private syncUrl(): void {
    this.sync.writeUrl(this.input.value.trim(), this.activeKinds);
  }

  private updateClearFiltersVisibility(): void {
    this.clearFilters.style.display =
      this.activeKinds.size > 0 || this.activeVersions !== null ? '' : 'none';
  }

  private filterPackages(): void {
    const language = this.activeLanguage();
    this.packages.querySelectorAll<HTMLElement>('.api-list-item').forEach((item) => {
      const supportsLanguage = (item.dataset.languages ?? '').split(',').includes(language);
      const supportsVersion =
        this.activeVersions === null ||
        (item.dataset.version !== undefined && this.activeVersions.has(item.dataset.version));
      item.style.display = supportsLanguage && supportsVersion ? '' : 'none';
    });
  }

  private applySearch(): void {
    const query = this.input.value.trim();
    if (!query && this.activeKinds.size === 0) {
      this.showPackages();
      return;
    }
    this.search(query);
  }

  private showPackages(): void {
    this.results.style.display = 'none';
    this.results.innerHTML = '';
    this.packages.style.display = '';
    this.status.textContent = '';
    this.count.textContent = formatAppHostApiSearchStats(
      getAppHostApiSearchStats(this.index, this.activeLanguage(), this.activeVersions)
    );
  }

  private search(query: string): void {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored: Array<{ entry: AppHostApiSearchEntry; score: number }> = [];
    for (const entry of this.index) {
      if (entry.l !== this.activeLanguage()) continue;
      if (this.activeKinds.size > 0 && !this.activeKinds.has(entry.k)) continue;
      if (this.activeVersions !== null && (!entry.v || !this.activeVersions.has(entry.v))) continue;

      let score = tokens.length === 0 ? 50 : 0;
      for (const token of tokens) {
        const tokenScore = scoreToken(entry, token);
        if (tokenScore === 0) {
          score = 0;
          break;
        }
        score += tokenScore;
      }
      if (score > 0) scored.push({ entry, score });
    }

    scored.sort((left, right) =>
      right.score - left.score || left.entry.n.localeCompare(right.entry.n)
    );
    this.scored = scored;
    this.tokens = tokens;
    this.visibleCount = 0;
    this.packages.style.display = 'none';
    this.results.style.display = '';
    this.results.innerHTML = '';

    if (scored.length === 0) {
      const heading = this.activeVersions?.size === 0
        ? 'No versions selected'
        : query
          ? `No results for "<strong>${escapeHtml(query)}</strong>"`
          : 'No results match the selected filters';
      this.results.innerHTML = `<div class="api-search-empty"><p>${heading}</p><p class="api-search-empty-hint">Try adjusting the language, version, kind, or search text.</p></div>`;
      this.count.textContent = '0 results';
      this.status.textContent = 'No API results found.';
      return;
    }

    this.loadMore();
  }

  private loadMore(): void {
    const next = this.scored.slice(this.visibleCount, this.visibleCount + PAGE_SIZE);
    this.visibleCount += next.length;
    this.results.querySelector('.api-load-more')?.remove();

    const fragment = document.createDocumentFragment();
    for (const { entry } of next) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderResult(entry, this.tokens);
      if (wrapper.firstElementChild) fragment.append(wrapper.firstElementChild);
    }
    this.results.append(fragment);

    const remaining = this.scored.length - this.visibleCount;
    this.count.textContent = remaining > 0
      ? `Showing ${this.visibleCount.toLocaleString()} of ${this.scored.length.toLocaleString()} results`
      : `${this.scored.length.toLocaleString()} result${this.scored.length === 1 ? '' : 's'}`;
    this.status.textContent = this.count.textContent;

    if (remaining > 0) {
      const button = document.createElement('button');
      button.className = 'api-load-more';
      button.type = 'button';
      button.textContent = `Show ${Math.min(remaining, PAGE_SIZE).toLocaleString()} more of ${remaining.toLocaleString()} remaining`;
      button.addEventListener('click', () => this.loadMore());
      this.results.append(button);
    }
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing AppHost API search element: ${id}`);
  return element as T;
}

function scoreToken(entry: AppHostApiSearchEntry, token: string): number {
  const name = entry.n.toLowerCase();
  if (name === token) return 100;
  if (name.startsWith(token)) return 60;
  if (camelMatch(entry.n, token)) return 55;
  if (name.includes(token)) return 40;
  if (entry.f.toLowerCase().includes(token)) return 30;
  if (entry.t?.toLowerCase().includes(token)) return 25;
  if (entry.p.toLowerCase().includes(token)) return 15;
  if (entry.s.toLowerCase().includes(token)) return 10;
  return 0;
}

function camelMatch(name: string, token: string): boolean {
  const capitals = name.replace(/[^A-Z]/g, '').toLowerCase();
  return capitals.length >= 2 && capitals.includes(token);
}

function renderResult(entry: AppHostApiSearchEntry, tokens: string[]): string {
  const color = KIND_COLORS[entry.k] ?? KIND_COLORS.method;
  const kindClass = entry.k.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const parent = entry.t
    ? `<span class="api-result-dot">&nbsp;·&nbsp;</span><span class="api-result-parent">${escapeHtml(entry.t)}</span>`
    : '';
  const description = entry.s
    ? `<div class="api-list-desc">${escapeHtml(entry.s)}</div>`
    : '';

  return `<a href="${escapeHtml(entry.h)}" class="api-list-item api-search-result" title="${escapeHtml(entry.f)} - ${escapeHtml(entry.p)}">
    <div class="api-list-header">
      <span class="api-result-name-wrap">
        <span class="api-search-result-name" style="color: ${color}">${highlight(entry.n, tokens)}</span>${parent}
      </span>
      <span class="api-kind-micro kind-${kindClass}">${escapeHtml(entry.k)}</span>
      <div class="trailing"><span class="api-list-meta">${escapeHtml(entry.p)}</span></div>
    </div>
    ${description}
  </a>`;
}

function highlight(text: string, tokens: string[]): string {
  if (tokens.length === 0) return escapeHtml(text);
  const pattern = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return escapeHtml(text).replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character
  );
}

document.addEventListener('DOMContentLoaded', () => {
  new AppHostApiSearchController();
  document.querySelector<HTMLInputElement>('#apphost-api-search-input')?.focus();
});
