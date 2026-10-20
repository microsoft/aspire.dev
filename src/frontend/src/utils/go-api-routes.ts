export interface GoRouteParameterLike {
  name?: string;
  type?: string;
  callbackSignature?: string;
  isCallback?: boolean;
}

export interface GoRouteCallableLike {
  name: string;
  kind?: string;
  description?: string;
  signature?: string;
  qualifiedName?: string;
  receiver?: string | null;
  targetTypeId?: string;
  expandedTargetTypes?: string[];
  parameters?: GoRouteParameterLike[];
}

export interface GoTopLevelRouteItemLike extends GoRouteCallableLike {
  fullName?: string;
  capabilities?: GoRouteCallableLike[];
}

export interface GoApiDocumentRouteLike {
  functions?: GoTopLevelRouteItemLike[];
  handleTypes?: GoTopLevelRouteItemLike[];
  dtoTypes?: GoTopLevelRouteItemLike[];
  enumTypes?: GoTopLevelRouteItemLike[];
}

const stableDocuments = new WeakSet<GoApiDocumentRouteLike>();
const stableCollections = new WeakSet<GoRouteCallableLike[]>();
const standaloneFunctions = new WeakMap<GoApiDocumentRouteLike, GoTopLevelRouteItemLike[]>();
const topLevelItems = new WeakMap<GoApiDocumentRouteLike, GoTopLevelRouteItemLike[]>();
const typesByName = new WeakMap<GoApiDocumentRouteLike, Map<string, GoTopLevelRouteItemLike>>();
const methodCollections = new WeakMap<GoRouteCallableLike[], Map<boolean, GoRouteCallableLike[]>>();
const itemIndexes = new WeakMap<GoTopLevelRouteItemLike[], SlugIndex<GoTopLevelRouteItemLike>>();
const methodIndexes = new WeakMap<GoRouteCallableLike[], Map<string | undefined, SlugIndex<GoRouteCallableLike>>>();

/**
 * Opt production collection data into route reuse. Freeze the JSON graph first:
 * array identity alone cannot detect edits to names, parameters or nested types.
 * Development and caller-owned mutable documents never enter these caches.
 * Weak keys keep indexes scoped to the lifetime of the loaded collection.
 */
export function prepareGoApiRoutes(doc: GoApiDocumentRouteLike): void {
  if (stableDocuments.has(doc)) return;
  freezeRouteData(doc);
  stableDocuments.add(doc);
  getGoTopLevelRouteItems(doc);
}

function freezeRouteData(value: object, seen = new WeakSet<object>()): void {
  if (seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value) as unknown[]) {
    if (child && typeof child === 'object') freezeRouteData(child, seen);
  }
  Object.freeze(value);
}

function stableCollection<T extends GoRouteCallableLike>(items: T[]): T[] {
  Object.freeze(items);
  stableCollections.add(items);
  return items;
}

/** Keep source ordering for URLs; sorted presentation has its own collision order. */
export function getGoMethods<T extends GoRouteCallableLike>(
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
    const collections = methodCollections.get(capabilities) ?? new Map<boolean, GoRouteCallableLike[]>();
    collections.set(sorted, stableCollection(methods));
    methodCollections.set(capabilities, collections);
  }
  return methods;
}

export function goSlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getGoMemberAnchor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

/** Top-level functions without a dotted ATS name: `CreateBuilder`, `AddRedis`, `WithDataVolume`, ... */
export function getGoStandaloneFunctions<T extends GoTopLevelRouteItemLike>(
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
export function getGoTypeByName(doc: GoApiDocumentRouteLike, name: string): GoTopLevelRouteItemLike | undefined {
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

export function getGoTopLevelRouteItems(doc: GoApiDocumentRouteLike): GoTopLevelRouteItemLike[] {
  const cached = topLevelItems.get(doc);
  if (cached) return cached;
  const items = [
    ...(doc.handleTypes ?? []),
    ...(doc.dtoTypes ?? []),
    ...(doc.enumTypes ?? []),
    ...getGoStandaloneFunctions(doc),
  ];
  if (stableDocuments.has(doc)) {
    topLevelItems.set(doc, stableCollection(items));
    for (const handle of doc.handleTypes ?? []) {
      if (handle.capabilities) stableCollections.add(handle.capabilities);
    }
  }
  return items;
}

export function getGoItemSlug(
  item: GoTopLevelRouteItemLike,
  allItems: GoTopLevelRouteItemLike[]
): string {
  let index = itemIndexes.get(allItems);
  if (!index) {
    index = createSlugIndex(allItems, getTopLevelDisambiguator);
    if (stableCollections.has(allItems)) itemIndexes.set(allItems, index);
  }
  return index.get(item);
}

export function getGoMethodSlug(
  method: GoRouteCallableLike,
  siblingMethods: GoRouteCallableLike[],
  parentName?: string
): string {
  let index = methodIndexes.get(siblingMethods)?.get(parentName);
  if (!index) {
    index = createSlugIndex(siblingMethods, (candidate) =>
      getCallableDisambiguator(candidate, { includeTarget: false, parentName })
    );
    if (stableCollections.has(siblingMethods)) {
      const contexts = methodIndexes.get(siblingMethods) ?? new Map<string | undefined, SlugIndex<GoRouteCallableLike>>();
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
    const base = goSlugify(item.name);
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
      const base = goSlugify(item.name);
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

function getTopLevelDisambiguator(item: GoTopLevelRouteItemLike): string {
  if (isCallableItem(item)) {
    return getCallableDisambiguator(item, { includeTarget: true });
  }

  return goSlugify(item.fullName ?? item.name);
}

function isCallableItem(item: GoTopLevelRouteItemLike): boolean {
  return Array.isArray(item.parameters)
    || Array.isArray(item.expandedTargetTypes)
    || typeof item.targetTypeId === 'string'
    || typeof item.qualifiedName === 'string'
    || typeof item.signature === 'string';
}

function getCallableDisambiguator(
  callable: GoRouteCallableLike,
  options: { includeTarget: boolean; parentName?: string }
): string {
  const parts: string[] = [];

  if (options.parentName) {
    parts.push(options.parentName);
  }

  if (options.includeTarget) {
    // Go methods carry their receiver type; only package-level functions such as
    // CreateBuilder have none, and those fall back to the ATS target when present.
    const targetRef = callable.receiver
      ?? callable.expandedTargetTypes?.[0]
      ?? callable.targetTypeId
      ?? getQualifiedNameContainer(callable.qualifiedName);

    if (targetRef) {
      parts.push(targetRef);
    }
  }

  const parameterTypes = (callable.parameters ?? [])
    .map((parameter) => parameter.callbackSignature ?? parameter.type)
    .filter((value): value is string => Boolean(value));

  if (parameterTypes.length > 0) {
    parts.push(...parameterTypes);
  } else {
    parts.push('noargs');
  }

  const candidate = parts.map((part) => goSlugify(part)).filter(Boolean).join('-');
  if (candidate) {
    return candidate;
  }

  return goSlugify(callable.signature ?? callable.qualifiedName ?? callable.name);
}

function getQualifiedNameContainer(qualifiedName?: string): string | undefined {
  if (!qualifiedName) {
    return undefined;
  }

  const lastDot = qualifiedName.lastIndexOf('.');
  return lastDot > 0 ? qualifiedName.slice(0, lastDot) : undefined;
}
