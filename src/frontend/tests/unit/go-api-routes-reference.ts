import type { GoRouteCallableLike, GoTopLevelRouteItemLike } from '@utils/go-api-routes';

// Pre-indexing implementation, intentionally confined to the equivalence oracle.
export function referenceSlug(
  item: GoTopLevelRouteItemLike,
  siblings: GoTopLevelRouteItemLike[],
  options?: { parentName?: string },
  countNormalization: () => void = () => {}
): string {
  const slugify = (name: string) => {
    countNormalization();
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };
  const callableDisambiguator = (callable: GoRouteCallableLike, includeTarget: boolean) => {
    const parts: string[] = [];
    if (options?.parentName) parts.push(options.parentName);
    if (includeTarget) {
      const lastDot = callable.qualifiedName?.lastIndexOf('.') ?? -1;
      const container = lastDot > 0 ? callable.qualifiedName?.slice(0, lastDot) : undefined;
      const target = callable.receiver ?? callable.expandedTargetTypes?.[0] ?? callable.targetTypeId ?? container;
      if (target) parts.push(target);
    }
    const types = (callable.parameters ?? [])
      .map((parameter) => parameter.callbackSignature ?? parameter.type)
      .filter((value): value is string => Boolean(value));
    if (types.length) parts.push(...types);
    else parts.push('noargs');
    return parts.map(slugify).filter(Boolean).join('-')
      || slugify(callable.signature ?? callable.qualifiedName ?? callable.name);
  };
  const disambiguator = (candidate: GoTopLevelRouteItemLike) => {
    if (options) return callableDisambiguator(candidate, false);
    const callable = Array.isArray(candidate.parameters)
      || Array.isArray(candidate.expandedTargetTypes)
      || typeof candidate.targetTypeId === 'string'
      || typeof candidate.qualifiedName === 'string'
      || typeof candidate.signature === 'string';
    return callable ? callableDisambiguator(candidate, true) : slugify(candidate.fullName ?? candidate.name);
  };
  const append = (base: string, suffix: string) => suffix ? `${base}-${suffix}` : base;
  const base = slugify(item.name);
  const conflicts = siblings.filter((candidate) => slugify(candidate.name) === base);
  if (conflicts.length <= 1) return base;
  const slug = append(base, disambiguator(item));
  const same = conflicts.filter((candidate) => append(base, disambiguator(candidate)) === slug);
  if (same.length <= 1) return slug;
  const occurrence = same.findIndex((candidate) => candidate === item);
  return occurrence > 0 ? `${slug}-${occurrence + 1}` : slug;
}
