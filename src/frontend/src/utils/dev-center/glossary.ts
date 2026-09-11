import type { TopicId } from './topics';

export interface GlossaryTerm {
  id: string;
  body?: string;
  data: {
    title: string;
    description: string;
    aliases: string[];
    termType?: string;
    pronunciation?: string;
    topics: TopicId[];
    context: string;
    related: string[];
    resources: { title: string; href: string }[];
    legacyAnchors: string[];
    legacyGroup?: string;
  };
}

export const legacyGroups = [
  ['core-concepts', 'Core concepts'],
  ['apis-and-patterns', 'APIs and patterns'],
  ['key-terms', 'Key terms'],
  ['resource-types', 'Resource types'],
  ['execution-modes', 'Execution modes'],
  ['dashboard-and-observability', 'Dashboard and observability'],
  ['common-patterns', 'Common patterns'],
  ['api-reference-terms', 'API reference terms'],
] as const;

export function glossaryHref(id: string): string {
  return `/dev/glossary/${id}/`;
}

export function glossaryReturnHref(value: string | null, origin: string): string | undefined {
  if (!value) return undefined;
  try {
    const target = new URL(value, origin);
    if (target.origin === origin && target.pathname === '/dev/glossary/') {
      return `${target.pathname}${target.search}`;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function normalizeGlossaryText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim();
}

export function glossarySearchText(term: GlossaryTerm): string {
  return normalizeGlossaryText([
    term.data.title, ...term.data.aliases, term.data.termType ?? '', term.data.pronunciation ?? '',
    term.data.description, term.data.context, term.body ?? '',
  ].join(' '));
}

export function matchesGlossaryQuery(text: string, query: string): boolean {
  return normalizeGlossaryText(query).split(/\s+/).every((token) => text.includes(token));
}

export function glossaryLetter(title: string): string {
  return title.charAt(0).toUpperCase();
}

export function sortGlossary<T extends GlossaryTerm>(terms: T[]): T[] {
  return [...terms].sort((a, b) => a.data.title.localeCompare(b.data.title, 'en'));
}

export function validateGlossary(terms: GlossaryTerm[]): string[] {
  const errors: string[] = [];
  const ids = new Set(terms.map((term) => term.id));
  const names = new Map<string, string>();
  const anchors = new Set<string>([...legacyGroups.map(([id]) => id), 'see-also']);
  for (const term of terms) {
    for (const name of [term.data.title, ...term.data.aliases]) {
      const normalized = normalizeGlossaryText(name);
      const owner = names.get(normalized);
      if (owner && owner !== term.id) errors.push(`Duplicate name: ${name}`);
      names.set(normalized, term.id);
    }
    for (const anchor of term.data.legacyAnchors) {
      if (anchors.has(anchor)) errors.push(`Duplicate anchor: ${anchor}`);
      anchors.add(anchor);
    }
    for (const related of term.data.related) {
      if (!ids.has(related)) errors.push(`Missing related term: ${term.id} → ${related}`);
    }
    if (term.data.legacyGroup && !legacyGroups.some(([id]) => id === term.data.legacyGroup)) {
      errors.push(`Unknown legacy group: ${term.data.legacyGroup}`);
    }
  }
  return errors;
}
