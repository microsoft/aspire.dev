import type { DevResource } from './resource-types';
import { normalizeGlossaryText } from './glossary';
import { topics } from './topics';
import { tagLabel } from '../sample-tags';

export const RESOURCE_PAGE_SIZE = 24;
export const facetNames = ['type', 'topic', 'language', 'provider', 'platform'] as const;
export type FacetName = (typeof facetNames)[number];
export type ResourceFacets = Record<FacetName, string[]>;
export type BrowseSort = 'newest' | 'oldest';
export type BrowseTitleSort = 'asc' | 'desc';
export interface BrowseState extends ResourceFacets {
  q: string;
  sort: BrowseSort;
  titleSort: BrowseTitleSort;
  page: number;
}

export interface ResourceSearchEntry {
  id: string;
  title: string;
  text: string;
  type: string;
  topic: string[];
  language: string[];
  provider: string[];
  platform: string[];
  date: string;
}

export function resourceFacetLabel(value: string): string {
  return value === 'aws' ? 'AWS' : value === 'gcp' ? 'Google Cloud' : value === 'youtube' ? 'YouTube' : tagLabel(value);
}

export function resourceSearchEntry(resource: DevResource): ResourceSearchEntry {
  return {
    id: resource.id,
    title: resource.title,
    text: normalizeGlossaryText([
      resource.title, resource.description, ...resource.tags, ...resource.languages,
      resource.platform ?? '',
      ...resource.languages.map(resourceFacetLabel), ...resource.providers.map(resourceFacetLabel),
      ...resource.providers, ...resource.topics.map((id) => topics.find((topic) => topic.id === id)?.title ?? id),
    ].join(' ')),
    type: resource.type,
    topic: resource.topics,
    language: resource.languages,
    provider: resource.providers,
    platform: resource.platform ? [resource.platform] : [],
    date: resource.date?.slice(0, 10) ?? '',
  };
}

export function resourceFacets(entries: ResourceSearchEntry[]): ResourceFacets {
  return Object.fromEntries(facetNames.map((name) => [
    name, [...new Set(entries.flatMap((entry) => entry[name]))].sort(),
  ])) as ResourceFacets;
}

export function readBrowseState(params: URLSearchParams, available: ResourceFacets): BrowseState {
  const sort = params.get('sort');
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);
  return {
    q,
    type: [...new Set(params.getAll('type'))].filter((value) => available.type.includes(value)),
    topic: [...new Set(params.getAll('topic'))].filter((value) => available.topic.includes(value)),
    language: [...new Set(params.getAll('language'))].filter((value) => available.language.includes(value)),
    provider: params.getAll('provider').filter((value) => available.provider.includes(value)).slice(0, 1),
    platform: [...new Set(params.getAll('platform'))].filter((value) => available.platform.includes(value)),
    sort: sort === 'oldest' ? 'oldest' : 'newest',
    titleSort: params.get('title') === 'desc' || (!params.has('title') && sort === 'title-desc') ? 'desc' : 'asc',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function writeBrowseState(url: URL, state: BrowseState): URL {
  const next = new URL(url);
  for (const key of ['q', 'sort', 'title', 'page', ...facetNames]) next.searchParams.delete(key);
  if (state.q.trim()) next.searchParams.set('q', state.q.trim());
  for (const name of facetNames) {
    for (const value of state[name]) next.searchParams.append(name, value);
  }
  if (state.sort !== 'newest') next.searchParams.set('sort', state.sort);
  if (state.titleSort !== 'asc') next.searchParams.set('title', state.titleSort);
  if (state.page > 1) next.searchParams.set('page', String(state.page));
  next.hash = '';
  return next;
}

export function matchesResource(entry: ResourceSearchEntry, state: BrowseState, omit?: FacetName): boolean {
  if (!normalizeGlossaryText(state.q).split(/\s+/).every((word) => entry.text.includes(word))) return false;
  return facetNames.every((name) =>
    name === omit || state[name].length === 0 || state[name].some((value) =>
      name === 'type' ? entry.type === value : entry[name].includes(value)));
}

export function resourceMatchRanges(text: string, query: string): { start: number; end: number }[] {
  const words = [...new Set(normalizeGlossaryText(query).split(/\s+/).filter(Boolean))];
  if (!words.length) return [];

  // Map normalized matches back to whole graphemes, preserving accents and ligatures.
  let normalized = '';
  const offsets: { start: number; end: number }[] = [];
  for (const { segment, index } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)) {
    const value = /^\s+$/u.test(segment) ? segment : normalizeGlossaryText(segment);
    normalized += value;
    for (let i = 0; i < value.length; i++) offsets.push({ start: index, end: index + segment.length });
  }

  const ranges: { start: number; end: number }[] = [];
  for (const word of words) {
    let index = normalized.indexOf(word);
    while (index !== -1) {
      ranges.push({ start: offsets[index].start, end: offsets[index + word.length - 1].end });
      index = normalized.indexOf(word, index + 1);
    }
  }
  const merged: typeof ranges = [];
  for (const range of ranges.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push(range);
  }
  return merged;
}

export function filterResources(entries: ResourceSearchEntry[], state: BrowseState): ResourceSearchEntry[] {
  return entries.filter((entry) => matchesResource(entry, state)).sort((a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return state.sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    }
    const titleOrder = a.title.localeCompare(b.title, 'en', { numeric: true }) || a.id.localeCompare(b.id);
    return state.titleSort === 'desc' ? -titleOrder : titleOrder;
  });
}

export function browsePageItems(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'gap', pages];
  if (page >= pages - 3) return [1, 'gap', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, 'gap', page - 1, page, page + 1, 'gap', pages];
}
