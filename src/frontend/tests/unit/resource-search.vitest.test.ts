import { describe, expect, it } from 'vitest';
import {
  browsePageItems, filterResources, matchesResource, readBrowseState, resourceFacets, resourceMatchRanges, resourceSearchEntry,
  writeBrowseState, type BrowseState,
} from '../../src/utils/dev-center/resource-search';
import type { DevResource } from '../../src/utils/dev-center/resource-types';

const resource = (id: string, overrides: Partial<DevResource> = {}): DevResource => ({
  id, title: id, description: 'Configure your app.', href: `/test/${id}/`, type: 'guide',
  topics: ['foundations'], tags: [], languages: [], providers: [], ...overrides,
});
const entries = [
  resource('redis', { title: 'Redis', type: 'integration', topics: ['integrations'], tags: ['Aspire.Hosting.Redis'], languages: ['C#'], date: '2026-08-01' }),
  resource('guide', { title: 'Configure Redis caching', topics: ['integrations'], date: '2026-08-02' }),
  resource('apphost', { title: 'AppHost', type: 'glossary' }),
  resource('cafe', { title: 'Cafe deployment', description: 'Déploy a café app.', topics: ['deployment'], providers: ['Azure'] }),
].map(resourceSearchEntry);
const facets = resourceFacets(entries);
const state = (overrides: Partial<BrowseState> = {}): BrowseState => ({
  ...readBrowseState(new URLSearchParams(), facets), ...overrides,
});

describe('resource search highlights', () => {
  it.each([
    ['Redis and REDIS caching', 'redis CACH', ['Redis', 'REDIS', 'cach']],
    ['Deploy a caf\u00e9 or cafe\u0301 app', 'CAFE', ['caf\u00e9', 'cafe\u0301']],
    ['An o\ufb03ce app', 'office', ['o\ufb03ce']],
    ['  Deploy \ud83d\ude80 Redis  ', 'redis', ['Redis']],
    ['Banana', 'ana nan ana', ['anana']],
    ['C# / C++ / [Redis] / .NET', 'C# C++ [Redis] .NET', ['C#', 'C++', '[Redis]', '.NET']],
    ['<img src=x onerror=alert(1)>', '<img', ['<img']],
    ['Redis caching', '   ', []],
    ['Redis caching', 'missing', []],
  ])('preserves original text and highlights literal tokens in %s', (text, query, expected) => {
    const ranges = resourceMatchRanges(text, query);
    expect(ranges.map(({ start, end }) => text.slice(start, end))).toEqual(expected);
    expect(ranges.every(({ start, end }) => start >= 0 && end <= text.length && start < end)).toBe(true);
  });
});

describe('resource discovery', () => {
  it('combines selected languages with OR while respecting other facets and preserving URLs', () => {
    const multilingual = [
      resource('csharp', { languages: ['csharp'], providers: ['azure'] }),
      resource('typescript', { languages: ['typescript'], providers: ['aws'] }),
      resource('both', { languages: ['csharp', 'typescript'], providers: ['azure'] }),
      resource('python', { languages: ['python'], providers: ['azure'] }),
    ].map(resourceSearchEntry);
    const available = resourceFacets(multilingual);
    const selected = readBrowseState(new URLSearchParams('language=csharp&language=typescript&language=csharp&language=unknown'), available);
    expect(selected.language).toEqual(['csharp', 'typescript']);
    expect(filterResources(multilingual, selected).map(({ id }) => id)).toEqual(['both', 'csharp', 'typescript']);
    expect(filterResources(multilingual, { ...selected, provider: ['azure'] }).map(({ id }) => id)).toEqual(['both', 'csharp']);
    expect(multilingual.filter((entry) => matchesResource(entry, { ...selected, provider: ['azure'] }, 'language'))).toHaveLength(3);
    expect(readBrowseState(writeBrowseState(new URL('https://aspire.dev/dev/browse/'), selected).searchParams, available)).toEqual(selected);
    expect(readBrowseState(new URLSearchParams('language=csharp'), available).language).toEqual(['csharp']);
  });

  it('searches metadata without requiring full documentation bodies', () => {
    expect(filterResources(entries, state({ q: 'ASPIRE.Hosting.redis' })).map((entry) => entry.id)).toEqual(['redis']);
    expect(filterResources(entries, state({ q: 'cafe deploy' })).map((entry) => entry.id)).toEqual(['cafe']);
    expect(filterResources(entries, state({ q: 'C#' })).map((entry) => entry.id)).toEqual(['redis']);
    expect(filterResources(entries, state({ q: 'configure redis' })).map((entry) => entry.id)).toEqual(['guide', 'redis']);
  });

  it('matches any selected value within a facet and all selected facets', () => {
    expect(filterResources(entries, state({ type: ['guide', 'integration'], topic: ['integrations'] }))
      .map((entry) => entry.id)).toEqual(['guide', 'redis']);
    expect(filterResources(entries, state({ type: ['guide'], topic: ['foundations', 'deployment'] }))
      .map((entry) => entry.id)).toEqual(['cafe']);
    expect(filterResources(entries, state({ language: ['C#'], provider: ['Azure'] }))).toEqual([]);
  });

  it('counts a facet against other filters without removing selected zero-result choices', () => {
    expect(entries.filter((entry) => matchesResource(entry, state({ type: ['glossary'], q: 'redis' }), 'type')))
      .toHaveLength(2);
    expect(filterResources(entries, state({ type: ['glossary'], q: 'redis' }))).toHaveLength(0);
  });

  it('defaults to newest followed by ascending titles and keeps date priority when searching', () => {
    expect(state().sort).toBe('newest');
    expect(state().titleSort).toBe('asc');
    expect(filterResources(entries, state({ q: 'redis' }))[0].id).toBe('guide');
    expect(filterResources(entries, state({ q: 'redis', titleSort: 'desc' }))[0].id).toBe('guide');
    expect(filterResources(entries, state({ q: 'redis', sort: 'oldest', titleSort: 'desc' }))[0].id).toBe('redis');
  });

  it.each([
    ['newest', 'asc', ['new-a', 'new-z', 'old-a', 'old-z', 'undated-a', 'undated-z']],
    ['newest', 'desc', ['new-z', 'new-a', 'old-z', 'old-a', 'undated-z', 'undated-a']],
    ['oldest', 'asc', ['old-a', 'old-z', 'new-a', 'new-z', 'undated-a', 'undated-z']],
    ['oldest', 'desc', ['old-z', 'old-a', 'new-z', 'new-a', 'undated-z', 'undated-a']],
  ] as const)('combines %s dates with %s titles within each day and undated resources', (sort, titleSort, expected) => {
    const dated = [
      resource('old-z', { title: 'Z', date: '2026-08-01T09:00:00Z' }),
      resource('new-z', { title: 'Z', date: '2026-08-02T09:00:00Z' }),
      resource('undated-z', { title: 'Z' }),
      resource('new-a', { title: 'A', date: '2026-08-02T18:00:00Z' }),
      resource('old-a', { title: 'A', date: '2026-08-01T18:00:00Z' }),
      resource('undated-a', { title: 'A' }),
    ].map(resourceSearchEntry);
    expect(filterResources(dated, state({ sort, titleSort })).map(({ id }) => id)).toEqual(expected);
  });

  it('compares numeric titles and uses resource IDs to break matching-title ties', () => {
    const sameDay = [
      resource('c', { title: 'Example 10', date: '2026-08-01' }),
      resource('b', { title: 'Example 2', date: '2026-08-01' }),
      resource('a', { title: 'Example 2', date: '2026-08-01' }),
    ].map(resourceSearchEntry);
    expect(filterResources(sameDay, state()).map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(filterResources(sameDay, state({ titleSort: 'desc' })).map(({ id }) => id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps undated entries last in both date directions', () => {
    expect(filterResources(entries, state()).map((entry) => entry.id))
      .toEqual(['guide', 'redis', 'apphost', 'cafe']);
    expect(filterResources(entries, state({ sort: 'oldest' })).map((entry) => entry.id))
      .toEqual(['redis', 'guide', 'apphost', 'cafe']);
  });

  it.each([
    ['newest', 'asc'], ['newest', 'desc'], ['oldest', 'asc'], ['oldest', 'desc'],
  ] as const)('round-trips the combined %s / %s ordering', (sort, titleSort) => {
    const selected = state({ sort, titleSort });
    const url = writeBrowseState(new URL('https://aspire.dev/dev/browse/'), selected);
    expect(readBrowseState(url.searchParams, facets)).toEqual(selected);
    expect(url.searchParams.get('sort')).toBe(sort === 'newest' ? null : sort);
    expect(url.searchParams.get('title')).toBe(titleSort === 'asc' ? null : titleSort);
  });

  it('normalizes old title-only URLs into combined sorting', () => {
    const selected = readBrowseState(new URLSearchParams('sort=title-desc'), facets);
    expect(selected).toEqual(state({ titleSort: 'desc' }));
    expect(writeBrowseState(new URL('https://aspire.dev/dev/browse/?sort=title-desc'), selected).search).toBe('?title=desc');
    expect(readBrowseState(new URLSearchParams('sort=title'), facets)).toEqual(state());
    expect(readBrowseState(new URLSearchParams('sort=title-desc&title=asc'), facets)).toEqual(state());
    expect(readBrowseState(new URLSearchParams('title=unknown'), facets)).toEqual(state());
  });

  it('normalizes obsolete relevance URLs to the date default', () => {
    const selected = readBrowseState(new URLSearchParams('q=redis&sort=relevance'), facets);
    expect(selected.sort).toBe('newest');
    expect(writeBrowseState(new URL('https://aspire.dev/dev/browse/'), selected).search).toBe('?q=redis');
  });

  describe('resource pagination', () => {
    it.each([
      [1, 1, [1]],
      [2, 3, [1, 2, 3]],
      [4, 7, [1, 2, 3, 4, 5, 6, 7]],
      [1, 20, [1, 2, 3, 4, 5, 'gap', 20]],
      [4, 20, [1, 2, 3, 4, 5, 'gap', 20]],
      [5, 20, [1, 'gap', 4, 5, 6, 'gap', 20]],
      [10, 20, [1, 'gap', 9, 10, 11, 'gap', 20]],
      [17, 20, [1, 'gap', 16, 17, 18, 19, 20]],
      [20, 20, [1, 'gap', 16, 17, 18, 19, 20]],
    ] as const)('shows a compact page window for page %i of %i', (page, pages, expected) => {
      expect(browsePageItems(page, pages)).toEqual(expected);
    });

    it('always includes current, first, and last pages without duplicate or missing one-page gaps', () => {
      for (let pages = 1; pages <= 30; pages++) {
        for (let page = 1; page <= pages; page++) {
          const items = browsePageItems(page, pages);
          const numbers = items.filter((item) => item !== 'gap');
          expect(items.length).toBeLessThanOrEqual(7);
          expect(numbers).toContain(page);
          expect(numbers[0]).toBe(1);
          expect(numbers.at(-1)).toBe(pages);
          expect(new Set(numbers).size).toBe(numbers.length);
          for (let index = 1; index < items.length - 1; index++) {
            if (items[index] === 'gap') expect(Number(items[index + 1]) - Number(items[index - 1])).toBeGreaterThan(2);
          }
        }
      }
    });
  });

  it('round-trips valid shareable state while retaining unrelated URL parameters', () => {
    const initial = state({ q: ' redis ', type: ['integration', 'guide'], topic: ['integrations'], language: ['C#'], sort: 'newest', page: 2 });
    const url = writeBrowseState(new URL('https://aspire.dev/dev/browse/?campaign=docs#old'), initial);
    expect(url.searchParams.get('campaign')).toBe('docs');
    expect(url.hash).toBe('');
    expect(readBrowseState(url.searchParams, facets)).toEqual({ ...initial, q: 'redis' });
    expect(writeBrowseState(url, state()).search).toBe('?campaign=docs');
  });

  it('ignores unknown facets and sorting, deduplicates selections, and rejects invalid pages', () => {
    const parsed = readBrowseState(new URLSearchParams('type=integration&type=unknown&type=integration&topic=missing&language=missing&provider=missing&sort=garbage&page=Infinity'), facets);
    expect(parsed).toEqual(state({ type: ['integration'] }));
    for (const value of ['-3', '0', '1.5', 'NaN', '9007199254740992']) {
      expect(readBrowseState(new URLSearchParams(`page=${value}`), facets).page).toBe(1);
    }
  });

  it('does not mutate source order and leaves unmatched searches empty', () => {
    const original = [...entries];
    expect(filterResources(entries, state({ q: 'does-not-exist' }))).toEqual([]);
    filterResources(entries, state({ sort: 'newest' }));
    expect(entries).toEqual(original);
  });

  it('filters video platforms independently and round-trips multiple platforms', () => {
    const media = [
      resource('youtube', { type: 'video', platform: 'youtube' }),
      resource('twitch', { type: 'video', platform: 'twitch' }),
      resource('guide'),
    ].map(resourceSearchEntry);
    const available = resourceFacets(media);
    const selected = readBrowseState(new URLSearchParams('platform=twitch'), available);
    expect(filterResources(media, selected).map(({ id }) => id)).toEqual(['twitch']);
    const both = readBrowseState(new URLSearchParams('platform=twitch&platform=youtube'), available);
    expect(filterResources(media, both)).toHaveLength(2);
    expect(readBrowseState(writeBrowseState(new URL('https://aspire.dev/dev/browse/'), both).searchParams, available)).toEqual(both);
  });
});
