import type {
  AppHostApiItem,
  AppHostModuleDocument,
} from './apphost-modules';
import {
  appHostSlugify,
  getSupportedProjection,
} from './apphost-modules';

export function getAppHostTopLevelItems(document: AppHostModuleDocument): AppHostApiItem[] {
  return document.items.filter((item) =>
    item.kind !== 'capability' || !item.qualifiedName?.includes('.')
  );
}

export function getAppHostItemSlug(
  item: AppHostApiItem,
  siblings: AppHostApiItem[]
): string {
  return uniqueSlug(item, siblings);
}

export function getAppHostMemberSlug(
  item: AppHostApiItem,
  siblings: AppHostApiItem[],
  parentName?: string
): string {
  return uniqueSlug(item, siblings, parentName);
}

function uniqueSlug(
  item: AppHostApiItem,
  siblings: AppHostApiItem[],
  parentName?: string
): string {
  const identifier = stableIdentifier(item);
  const base = appHostSlugify(identifier);
  const conflicts = siblings.filter((candidate) => appHostSlugify(stableIdentifier(candidate)) === base);
  if (conflicts.length <= 1) return base;

  const disambiguator = [
    parentName,
    item.targetTypeId,
    ...(item.parameters ?? []).map((parameter) => parameter.type),
  ]
    .filter(Boolean)
    .map((value) => appHostSlugify(String(value)))
    .filter(Boolean)
    .join('-') || appHostSlugify(item.id);

  const candidate = `${base}-${disambiguator}`;
  const same = conflicts.filter((entry) => {
    const entryDisambiguator = [
      parentName,
      entry.targetTypeId,
      ...(entry.parameters ?? []).map((parameter) => parameter.type),
    ]
      .filter(Boolean)
      .map((value) => appHostSlugify(String(value)))
      .filter(Boolean)
      .join('-') || appHostSlugify(entry.id);
    return `${base}-${entryDisambiguator}` === candidate;
  });

  const index = same.findIndex((entry) => entry === item);
  return index > 0 ? `${candidate}-${index + 1}` : candidate;
}

function stableIdentifier(item: AppHostApiItem): string {
  return getSupportedProjection(item, 'typescript')?.identifier ?? item.name;
}
