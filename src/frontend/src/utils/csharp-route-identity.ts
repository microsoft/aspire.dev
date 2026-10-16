export function genericArity(type: { genericParameters?: { name: string }[] }): number {
  return type.genericParameters?.length ?? 0;
}

export function slugify(name: string, arity = 0): string {
  const slug = name.toLowerCase();
  return arity > 0 ? `${slug}-${arity}` : slug;
}

export function packageSlug(name: string): string {
  return name.toLowerCase();
}

export const memberKindOrder = [
  'constructor', 'property', 'method', 'field', 'event', 'indexer',
] as const;

export const memberKindSlugs: Record<string, string> = {
  constructor: 'constructors',
  property: 'properties',
  method: 'methods',
  field: 'fields',
  event: 'events',
  indexer: 'indexers',
};
