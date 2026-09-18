import { afterEach, describe, expect, it, vi } from 'vitest';
import { select, selectAll } from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';
import SearchField from '@components/search/SearchField.astro';
import SearchEmptyState from '@components/search/SearchEmptyState.astro';
import InpageSearch from '@components/api-reference/InpageSearch.astro';
import ApiSearchBar from '@components/api-reference/ApiSearchBar.astro';
import VersionFilter from '@components/api-reference/VersionFilter.astro';
import { createSearchEmptyState, searchRecoveryAction } from '@components/search/search-empty-state';
import { renderComponent } from './astro-test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { ApiSearchPresentation } from '../../src/pages/reference/api/_search-presentation';

const parse = (html: string) => unified().use(rehypeParse, { fragment: true }).parse(html);

describe('neutral search presentation', () => {
  it('type-checks the actual neutral component prop declarations', () => {
    const declarations = ['SearchField', 'SearchEmptyState'].map(name => {
      const frontmatter = readFileSync(resolve(`src/components/search/${name}.astro`), 'utf8').split('---')[1];
      const source = ts.createSourceFile(`${name}.ts`, frontmatter, ts.ScriptTarget.Latest, true);
      const props = source.statements.find(ts.isInterfaceDeclaration)!;
      return ts.createPrinter().printNode(ts.EmitHint.Unspecified, props, source).replace('interface Props', `interface ${name}Props`);
    }).join('\n');
    const contract = `${declarations}
      const field: SearchFieldProps = { id: 'api', label: 'Search API', size: 'sm', clearId: 'clear' };
      const empty: SearchEmptyStateProps = { title: 'No matching entries', hidden: true, actionLabel: 'Clear search' };
      // @ts-expect-error Accessible labels are required.
      const missingLabel: SearchFieldProps = { id: 'api' };
      // @ts-expect-error Size is an intentional two-value union.
      const invalidSize: SearchFieldProps = { id: 'api', label: 'Search API', size: 'wide' };
      // @ts-expect-error Visibility is boolean.
      const invalidHidden: SearchEmptyStateProps = { title: 'Empty', hidden: 'yes' };
    `;
    const file = resolve('tests/typecheck/search-presentation.virtual.ts').replaceAll('\\', '/');
    const options: ts.CompilerOptions = { noEmit: true, strict: true, types: [], target: ts.ScriptTarget.ES2022 };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => name.replaceAll('\\', '/') === file
      ? ts.createSourceFile(name, contract, languageVersion, true)
      : original(name, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram([file], options, host);
    expect(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([]);
  });

  it.each(['lg', 'sm'])('renders a labeled %s input with a query-only clear affordance', async (size) => {
    const tree = parse(await renderComponent(SearchField, {
      props: { id: 'find-input', label: 'Search API entries', placeholder: 'Try Redis', clearId: 'find-clear', describedBy: 'find-status', size },
    }));
    expect(select('label', tree)?.properties.htmlFor).toEqual(['find-input']);
    expect(select('input', tree)?.properties).toMatchObject({
      id: 'find-input', type: 'search', ariaDescribedBy: ['find-status'],
    });
    expect(select('button', tree)?.properties).toMatchObject({
      id: 'find-clear', type: 'button', ariaLabel: 'Clear search', style: 'display: none;',
    });
  });

  it.each([InpageSearch, ApiSearchBar])('retains API hooks and separate facet/reset actions', async (component) => {
    const tree = parse(await renderComponent(component, {
      props: { id: 'api', label: 'Search API entries', placeholder: 'Try Redis', kinds: ['class', 'method'], defaultStatsText: '2 entries' },
    }));
    for (const id of ['search-input', 'search-clear', 'search-status', 'search-results', 'clear-filters', 'reset-all']) {
      expect(select(`#api-${id}`, tree)).toBeDefined();
    }
    expect(selectAll('.search-field-input', tree)).toHaveLength(1);
    expect(select('#api-search-count.search-results-summary', tree)).toBeDefined();
    expect(selectAll('.api-filter-chip[aria-pressed="false"]', tree)).toHaveLength(2);
  });

  it('preserves contextual in-page layout hooks after extracting the search field', async () => {
    const tree = parse(await renderComponent(InpageSearch, {
      props: { id: 'glossary', label: 'Find a term', placeholder: 'Try AppHost', kinds: [], defaultStatsText: '32 terms' },
    }));
    expect(select('.inpage-search-bar .inpage-search-label[for="glossary-search-input"]', tree)).toBeDefined();
    expect(select('.inpage-search-input-wrap .inpage-search-input', tree)).toBeDefined();
    expect(select('.inpage-search-input-wrap .inpage-search-icon', tree)).toBeDefined();
    expect(select('.inpage-search-input-wrap .inpage-search-clear', tree)).toBeDefined();
  });

  it('renders compact empty state copy safely with just one recovery action', async () => {
    const html = await renderComponent(SearchEmptyState, {
      props: { title: 'No matching entries', hint: '<script>not markup</script>', actionLabel: 'Reset all', actionId: 'recover' },
    });
    const tree = parse(html);
    expect(selectAll('button', tree)).toHaveLength(1);
    expect(select('script', tree)).toBeUndefined();
    expect(select('.search-empty-title', tree)).toBeDefined();
  });

  it('uses checkbox-group semantics rather than an incomplete listbox', async () => {
    const tree = parse(await renderComponent(VersionFilter, { props: { id: 'api', versions: ['13.6.0'] } }));
    expect(select('[role="group"]', tree)?.properties.ariaLabel).toBe('Version selection');
    expect(select('[role="listbox"]', tree)).toBeUndefined();
  });

  it.each([
    [true, false, 3, 0, 'Clear search'],
    [false, true, 0, 3, 'Clear filters'],
    [true, true, 3, 2, 'Clear filters'],
    [true, true, 3, 0, 'Clear search'],
    [true, true, 0, 0, 'Reset all'],
  ] as const)('selects recovery for query=%s filters=%s alternative counts %s/%s', (query, filters, withoutQuery, withoutFilters, label) => {
    expect(searchRecoveryAction(query, filters, { withoutQuery, withoutFilters })).toBe(label);
  });

  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ['', false, true, 'none', 'none'],
    ['Redis', false, true, 'none', 'none'],
    ['', true, true, '', 'none'],
    ['Redis', true, true, 'none', ''],
    ['', true, false, 'none', 'none'],
    ['Redis', true, false, 'none', 'none'],
  ] as const)('shows only the appropriate toolbar action for query=%s filters=%s results=%s', (query, hasFilters, hasResults, clearDisplay, resetDisplay) => {
    const clearFilters = { style: { display: '' } };
    const reset = Object.assign(new EventTarget(), { style: { display: '' } });
    const root = { querySelector: (selector: string) => selector.includes('reset-all') ? reset : clearFilters } as unknown as HTMLElement;
    const presentation = new ApiSearchPresentation(root, { value: query } as HTMLInputElement, vi.fn(), new AbortController().signal);
    presentation.update(hasFilters, hasResults);
    expect(clearFilters.style.display).toBe(clearDisplay);
    expect(reset.style.display).toBe(resetDisplay);
  });

  it.each([
    [2, 3, 'Clear filters', false, true, 'keep your search text'],
    [2, 0, 'Clear search', true, false, 'keep the selected filters'],
    [0, 0, 'Reset all', true, true, 'Neither change alone returns results'],
  ] as const)('renders a contextual API recovery action for %s/%s alternatives', (withoutQuery, withoutFilters, label, clearsQuery, clearsFilters, hint) => {
    class Element extends EventTarget {
      textContent = '';
      className = '';
      type = '';
      value = '';
      style = { display: '' };
      attributes: Record<string, string> = {};
      children: Element[] = [];
      setAttribute(name: string, value: string) { this.attributes[name] = value; }
      insertBefore(child: Element, reference: Element | null) {
        if (reference === null) this.children.push(child);
        else this.children.splice(this.children.indexOf(reference), 0, child);
      }
      append(...children: Element[]) { this.children.push(...children); }
      replaceChildren(...children: Element[]) { this.children = children; }
      querySelector() { return null; }
      click() { this.dispatchEvent(new Event('click')); }
      focus = vi.fn();
    }
    vi.stubGlobal('document', { createElement: () => new Element() });
    const input = new Element();
    input.value = '<img src=x onerror=alert(1)>';
    const filters = new Element();
    const reset = new Element();
    const clearFilters = vi.fn();
    filters.addEventListener('click', clearFilters);
    const clearQuery = vi.fn();
    const root = { querySelector: (selector: string) => selector.includes('reset-all') ? reset : filters } as unknown as HTMLElement;
    const presentation = new ApiSearchPresentation(root, input as unknown as HTMLInputElement, clearQuery, new AbortController().signal);
    const results = new Element();
    presentation.renderEmpty(results as unknown as HTMLElement, true, false, { withoutQuery, withoutFilters }, new Set(['method']), new Set(['13.6.0']));
    expect(filters.style.display).toBe('none');
    expect(reset.style.display).toBe('none');
    const [title, guidance, activeFilters, button] = results.children[0].children;
    expect(title.textContent).toBe(`No API entries match "${input.value}" with these filters`);
    expect(activeFilters.className).toBe('search-active-filters');
    expect(activeFilters.attributes).toEqual({ role: 'list', 'aria-label': 'Active filters' });
    expect(activeFilters.children.map(item => item.textContent)).toEqual(['Kind: method', 'Version: 13.6.0']);
    expect(guidance.textContent).not.toMatch(/Kind:|Version:/);
    expect(guidance.textContent).toContain(hint);
    expect(button.textContent).toBe(label);
    button.click();
    expect(clearQuery).toHaveBeenCalledTimes(clearsQuery ? 1 : 0);
    expect(clearFilters).toHaveBeenCalledTimes(clearsFilters ? 1 : 0);
    expect(input.focus).toHaveBeenCalledOnce();
  });

  it('creates a dataset-empty state with no misleading recovery button', () => {
    const elements: { tag: string; textContent: string; children: unknown[]; append: (...children: unknown[]) => void }[] = [];
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        const element = { tag, textContent: '', children: [] as unknown[], querySelector() { return null; }, append(...children: unknown[]) { this.children.push(...children); } };
        elements.push(element);
        return element;
      },
    });
    createSearchEmptyState({ title: 'No API entries available', hint: 'There are no searchable entries.' });
    expect(elements.map(element => element.tag)).toEqual(['div', 'p', 'p']);
  });
});
