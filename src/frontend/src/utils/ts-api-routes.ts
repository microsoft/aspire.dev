import { freezeApiData } from './api-data';

export interface TsRouteParameterLike {
  name?: string;
  type?: string;
  callbackSignature?: string;
  isCallback?: boolean;
}

export interface TsRouteCallableLike {
  name: string;
  kind?: string;
  description?: string;
  signature?: string;
  qualifiedName?: string;
  targetTypeId?: string;
  expandedTargetTypes?: string[];
  parameters?: TsRouteParameterLike[];
}

export interface TsTopLevelRouteItemLike extends TsRouteCallableLike {
  fullName?: string;
  capabilities?: TsRouteCallableLike[];
}

export interface TsApiDocumentRouteLike {
  functions?: TsTopLevelRouteItemLike[];
  handleTypes?: TsTopLevelRouteItemLike[];
  dtoTypes?: TsTopLevelRouteItemLike[];
  enumTypes?: TsTopLevelRouteItemLike[];
}

const stableDocuments = new WeakSet<TsApiDocumentRouteLike>();
const stableCollections = new WeakSet<TsRouteCallableLike[]>();
const standaloneFunctions = new WeakMap<TsApiDocumentRouteLike, TsTopLevelRouteItemLike[]>();
const topLevelItems = new WeakMap<TsApiDocumentRouteLike, TsTopLevelRouteItemLike[]>();
const typesByName = new WeakMap<TsApiDocumentRouteLike, Map<string, TsTopLevelRouteItemLike>>();
const methodCollections = new WeakMap<TsRouteCallableLike[], Map<boolean, TsRouteCallableLike[]>>();
const itemIndexes = new WeakMap<TsTopLevelRouteItemLike[], SlugIndex<TsTopLevelRouteItemLike>>();
const methodIndexes = new WeakMap<TsRouteCallableLike[], Map<string | undefined, SlugIndex<TsRouteCallableLike>>>();

/**
 * Opt production collection data into route reuse. Freeze the JSON graph first:
 * array identity alone cannot detect edits to names, parameters or nested types.
 * Development and caller-owned mutable documents never enter these caches.
 * Weak keys keep indexes scoped to the lifetime of the loaded collection.
 */
export function prepareTsApiRoutes(doc: TsApiDocumentRouteLike): void {
  if (stableDocuments.has(doc)) return;
  freezeApiData(doc);
  stableDocuments.add(doc);
  getTsTopLevelRouteItems(doc);
}

function stableCollection<T extends TsRouteCallableLike>(items: T[]): T[] {
  Object.freeze(items);
  stableCollections.add(items);
  return items;
}

/** Keep source ordering for URLs; sorted presentation has its own collision order. */
export function getTsMethods<T extends TsRouteCallableLike>(
  handle: { capabilities?: T[] },
  sorted = false
): T[] {
  const capabilities = handle.capabilities;
  const cached = capabilities && methodCollections.get(capabilities)?.get(sorted);
  if (cached) return cached as T[];
  const methods = (capabilities ?? []).filter(
    (candidate) => candidate.kind === 'Method' || candidate.kind === 'InstanceMethod'
  );
  if (sorted) methods.sort((left, right) => left.name.localeCompare(right.name));
  if (capabilities && stableCollections.has(capabilities)) {
    const collections = methodCollections.get(capabilities) ?? new Map<boolean, TsRouteCallableLike[]>();
    collections.set(sorted, stableCollection(methods));
    methodCollections.set(capabilities, collections);
  }
  return methods;
}

export function tsSlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getTsMemberAnchor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

export function getTsStandaloneFunctions<T extends TsTopLevelRouteItemLike>(
  doc: { functions?: T[] }
): T[] {
  const cached = standaloneFunctions.get(doc);
  if (cached) return cached as T[];
  const functions = (doc.functions ?? []).filter(
    (fn) => !fn.qualifiedName || !fn.qualifiedName.includes('.')
  );
  if (stableDocuments.has(doc)) standaloneFunctions.set(doc, stableCollection(functions));
  return functions;
}

/** Resolve the first type with this display name, in the original catalog order. */
export function getTsTypeByName(doc: TsApiDocumentRouteLike, name: string): TsTopLevelRouteItemLike | undefined {
  let index = typesByName.get(doc);
  if (!index && stableDocuments.has(doc)) {
    index = new Map();
    for (const collection of [doc.handleTypes, doc.dtoTypes, doc.enumTypes]) {
      for (const item of collection ?? []) {
        if (!index.has(item.name)) index.set(item.name, item);
      }
    }
    typesByName.set(doc, index);
  }
  return index
    ? index.get(name)
    : doc.handleTypes?.find((item) => item.name === name)
      ?? doc.dtoTypes?.find((item) => item.name === name)
      ?? doc.enumTypes?.find((item) => item.name === name);
}

export function getTsTopLevelRouteItems(doc: TsApiDocumentRouteLike): TsTopLevelRouteItemLike[] {
  const cached = topLevelItems.get(doc);
  if (cached) return cached;
  const items = [
    ...(doc.handleTypes ?? []),
    ...(doc.dtoTypes ?? []),
    ...(doc.enumTypes ?? []),
    ...getTsStandaloneFunctions(doc),
  ];
  if (stableDocuments.has(doc)) {
    topLevelItems.set(doc, stableCollection(items));
    for (const handle of doc.handleTypes ?? []) {
      if (handle.capabilities) stableCollections.add(handle.capabilities);
    }
  }
  return items;
}

export function getTsItemSlug(
  item: TsTopLevelRouteItemLike,
  allItems: TsTopLevelRouteItemLike[]
): string {
  let index = itemIndexes.get(allItems);
  if (!index) {
    index = createSlugIndex(allItems, getTopLevelDisambiguator);
    if (stableCollections.has(allItems)) itemIndexes.set(allItems, index);
  }
  return index.get(item);
}

export function getTsMethodSlug(
  method: TsRouteCallableLike,
  siblingMethods: TsRouteCallableLike[],
  parentName?: string
): string {
  let index = methodIndexes.get(siblingMethods)?.get(parentName);
  if (!index) {
    index = createSlugIndex(siblingMethods, (candidate) =>
      getCallableDisambiguator(candidate, { includeTarget: false, parentName })
    );
    if (stableCollections.has(siblingMethods)) {
      const contexts = methodIndexes.get(siblingMethods) ?? new Map<string | undefined, SlugIndex<TsRouteCallableLike>>();
      contexts.set(parentName, index);
      methodIndexes.set(siblingMethods, contexts);
    }
  }
  return index.get(method);
}

interface SlugIndex<T> {
  get(item: T): string;
}

function createSlugIndex<T extends { name: string }>(
  siblings: T[],
  getDisambiguator: (candidate: T) => string
): SlugIndex<T> {
  const groups = new Map<string, T[]>();
  const slugs = new Map<T, string>();
  for (const item of siblings) {
    const base = tsSlugify(item.name);
    const group = groups.get(base);
    if (group) group.push(item);
    else groups.set(base, [item]);
  }

  for (const [base, group] of groups) {
    if (group.length === 1) {
      slugs.set(group[0], base);
      continue;
    }
    const occurrences = new Map<string, number>();
    for (const item of group) {
      const slug = appendDisambiguator(base, getDisambiguator(item));
      const occurrence = (occurrences.get(slug) ?? 0) + 1;
      occurrences.set(slug, occurrence);
      // Repeated references count as occurrences, but identity resolves to the first.
      if (!slugs.has(item)) slugs.set(item, occurrence > 1 ? `${slug}-${occurrence}` : slug);
    }
  }

  return {
    get(item) {
      const known = slugs.get(item);
      if (known !== undefined) return known;
      const base = tsSlugify(item.name);
      // A caller may supply an equivalent object not present in the collection.
      return (groups.get(base)?.length ?? 0) > 1
        ? appendDisambiguator(base, getDisambiguator(item))
        : base;
    },
  };
}

function appendDisambiguator(baseSlug: string, disambiguator: string): string {
  return disambiguator ? `${baseSlug}-${disambiguator}` : baseSlug;
}

function getTopLevelDisambiguator(item: TsTopLevelRouteItemLike): string {
  if (isCallableItem(item)) {
    return getCallableDisambiguator(item, { includeTarget: true });
  }

  const fullName = item.fullName ?? item.name;
  return tsSlugify(normalizeTypeReference(fullName));
}

function isCallableItem(item: TsTopLevelRouteItemLike): boolean {
  return Array.isArray(item.parameters)
    || Array.isArray(item.expandedTargetTypes)
    || typeof item.targetTypeId === 'string'
    || typeof item.qualifiedName === 'string'
    || typeof item.signature === 'string';
}

function getCallableDisambiguator(
  callable: TsRouteCallableLike,
  options: { includeTarget: boolean; parentName?: string }
): string {
  const parts: string[] = [];

  if (options.parentName) {
    parts.push(options.parentName);
  }

  if (options.includeTarget) {
    const targetRef = callable.expandedTargetTypes?.[0]
      ?? callable.targetTypeId
      ?? getQualifiedNameContainer(callable.qualifiedName);

    if (targetRef) {
      parts.push(normalizeTypeReference(targetRef));
    }
  }

  const parameterTypes = (callable.parameters ?? [])
    .map((parameter) => {
      const typeRef = parameter.isCallback && parameter.callbackSignature
        ? parameter.callbackSignature
        : parameter.callbackSignature ?? parameter.type;

      return typeRef ? normalizeTypeReference(typeRef) : undefined;
    })
    .filter((value): value is string => Boolean(value));

  if (parameterTypes.length > 0) {
    parts.push(...parameterTypes);
  } else {
    parts.push('noargs');
  }

  const candidate = parts.map((part) => tsSlugify(part)).filter(Boolean).join('-');
  if (candidate) {
    return candidate;
  }

  return tsSlugify(callable.signature ?? callable.qualifiedName ?? callable.name);
}

function getQualifiedNameContainer(qualifiedName?: string): string | undefined {
  if (!qualifiedName) {
    return undefined;
  }

  const lastDot = qualifiedName.lastIndexOf('.');
  return lastDot > 0 ? qualifiedName.slice(0, lastDot) : undefined;
}

function normalizeTypeReference(typeRef: string): string {
  const withoutAssemblyPrefix = typeRef.includes('/')
    ? typeRef.slice(typeRef.indexOf('/') + 1)
    : typeRef;

  return withoutAssemblyPrefix.replace(/\[\[([^\],]+),\s*[^\]]*\]\]/g, '[[$1]]');
}