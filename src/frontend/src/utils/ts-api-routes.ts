export interface TsRouteParameterLike {
  name?: string;
  type?: string;
  callbackSignature?: string;
  isCallback?: boolean;
}

export interface TsRouteCallableLike {
  name: string;
  signature?: string;
  qualifiedName?: string;
  targetTypeId?: string;
  expandedTargetTypes?: string[];
  parameters?: TsRouteParameterLike[];
}

export interface TsTopLevelRouteItemLike extends TsRouteCallableLike {
  fullName?: string;
}

export interface TsApiDocumentRouteLike {
  functions?: TsTopLevelRouteItemLike[];
  handleTypes?: TsTopLevelRouteItemLike[];
  dtoTypes?: TsTopLevelRouteItemLike[];
  enumTypes?: TsTopLevelRouteItemLike[];
}

export function tsSlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getTsStandaloneFunctions(doc: TsApiDocumentRouteLike): TsTopLevelRouteItemLike[] {
  return (doc.functions ?? []).filter(
    (fn) => !fn.qualifiedName || !fn.qualifiedName.includes('.')
  );
}

export function getTsTopLevelRouteItems(doc: TsApiDocumentRouteLike): TsTopLevelRouteItemLike[] {
  return [
    ...(doc.handleTypes ?? []),
    ...(doc.dtoTypes ?? []),
    ...(doc.enumTypes ?? []),
    ...getTsStandaloneFunctions(doc),
  ];
}

export function getTsItemSlug(
  item: TsTopLevelRouteItemLike,
  allItems: TsTopLevelRouteItemLike[]
): string {
  return getUniqueSlug(item, allItems, getTopLevelDisambiguator);
}

export function getTsMethodSlug(
  method: TsRouteCallableLike,
  siblingMethods: TsRouteCallableLike[],
  parentName?: string
): string {
  return getUniqueSlug(method, siblingMethods, (candidate) =>
    getCallableDisambiguator(candidate, { includeTarget: false, parentName })
  );
}

function getUniqueSlug<T extends { name: string }>(
  item: T,
  siblings: T[],
  getDisambiguator: (candidate: T) => string
): string {
  const baseSlug = tsSlugify(item.name);
  const conflicts = siblings.filter((candidate) => tsSlugify(candidate.name) === baseSlug);

  if (conflicts.length <= 1) {
    return baseSlug;
  }

  const disambiguatedSlug = appendDisambiguator(baseSlug, getDisambiguator(item));
  const sameSlugConflicts = conflicts.filter(
    (candidate) => appendDisambiguator(baseSlug, getDisambiguator(candidate)) === disambiguatedSlug
  );

  if (sameSlugConflicts.length <= 1) {
    return disambiguatedSlug;
  }

  const occurrence = sameSlugConflicts.findIndex((candidate) => candidate === item);
  return occurrence > 0 ? `${disambiguatedSlug}-${occurrence + 1}` : disambiguatedSlug;
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