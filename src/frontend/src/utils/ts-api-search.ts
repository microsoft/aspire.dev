import type { TsApiDocument, TsFunction, TsHandleType } from './ts-modules';
import type { TsApiSearchIndexEntry } from './ts-api-search-stats';
import { tsModuleSlug } from './ts-modules';
import {
  getTsCallableIdentityKey,
  getTsFunctionDisplayKind,
} from './ts-api-function-kind';
import {
  getTsItemSlug,
  getTsMemberAnchor,
  getTsMethodSlug,
  getTsStandaloneFunctions,
  getTsTopLevelRouteItems,
} from './ts-api-routes';

export type { TsApiSearchIndexEntry } from './ts-api-search-stats';

export function buildTsApiSearchIndex(packages: TsApiDocument[], base = ''): TsApiSearchIndexEntry[] {
  const normalizedBase = base.replace(/\/$/, '');
  const index: TsApiSearchIndexEntry[] = [];

  for (const pkg of packages) {
    const pkgName = pkg.package.name;
    const pkgSlug = tsModuleSlug(pkgName);
    const topLevelItems = getTsTopLevelRouteItems(pkg);
    const version = pkg.package.version;
    const withVersion = version ? { v: version } : {};
    const standaloneFunctions = getTsStandaloneFunctions(pkg);
    const standaloneFunctionKeys = new Set(
      standaloneFunctions.map((fn) => getTsCallableIdentityKey(fn))
    );

    for (const fn of standaloneFunctions) {
      const itemSlug = getTsItemSlug(fn, topLevelItems);
      if (!itemSlug) {
        continue;
      }

      index.push({
        n: fn.name,
        f: fn.signature ?? fn.qualifiedName ?? fn.name,
        k: getTsFunctionDisplayKind(fn),
        p: pkgName,
        s: fn.description ?? '',
        h: `${normalizedBase}/reference/api/typescript/${pkgSlug}/${itemSlug}/`,
        ...withVersion,
      });
    }

    for (const handle of pkg.handleTypes ?? []) {
      const itemSlug = getTsItemSlug(handle, topLevelItems);
      if (!itemSlug) {
        continue;
      }

      index.push({
        n: handle.name,
        f: handle.fullName ?? handle.name,
        k: handle.isInterface ? 'interface' : 'handle',
        p: pkgName,
        s: handle.description ?? `Handle type${handle.isInterface ? ' (interface)' : ''}`,
        h: `${normalizedBase}/reference/api/typescript/${pkgSlug}/${itemSlug}/`,
        ...withVersion,
      });

      addHandleMemberEntries(index, handle, pkgName, pkgSlug, itemSlug, normalizedBase, withVersion, standaloneFunctionKeys);
    }

    for (const dto of pkg.dtoTypes ?? []) {
      const itemSlug = getTsItemSlug(dto, topLevelItems);
      if (!itemSlug) {
        continue;
      }

      index.push({
        n: dto.name,
        f: dto.fullName ?? dto.name,
        k: 'type',
        p: pkgName,
        s: dto.description ?? `Type with ${dto.fields?.length ?? 0} fields`,
        h: `${normalizedBase}/reference/api/typescript/${pkgSlug}/${itemSlug}/`,
        ...withVersion,
      });
    }

    for (const enumType of pkg.enumTypes ?? []) {
      const itemSlug = getTsItemSlug(enumType, topLevelItems);
      if (!itemSlug) {
        continue;
      }

      index.push({
        n: enumType.name,
        f: enumType.fullName ?? enumType.name,
        k: 'enum',
        p: pkgName,
        s: enumType.description ?? `Enum: ${(enumType.members ?? []).join(', ')}`,
        h: `${normalizedBase}/reference/api/typescript/${pkgSlug}/${itemSlug}/`,
        ...withVersion,
      });
    }
  }

  return index;
}

function addHandleMemberEntries(
  index: TsApiSearchIndexEntry[],
  handle: TsHandleType,
  pkgName: string,
  pkgSlug: string,
  itemSlug: string,
  normalizedBase: string,
  withVersion: { v?: string },
  standaloneFunctionKeys: Set<string>
): void {
  const capabilities = handle.capabilities ?? [];
  const getters = capabilities.filter((capability) => capability.kind === 'PropertyGetter');
  const setters = capabilities.filter((capability) => capability.kind === 'PropertySetter');
  const methods = capabilities.filter(
    (capability) => capability.kind === 'Method' || capability.kind === 'InstanceMethod'
  );

  for (const getter of getters) {
    const hasSetter = setters.some(
      (setter) => setter.name.replace(/^set/, '').toLowerCase() === getter.name.toLowerCase()
    );

    index.push({
      n: getter.name,
      f: `${handle.name}.${getter.signature ?? getter.name}`,
      k: 'property',
      p: pkgName,
      s: getter.description ?? `Property on ${handle.name}${hasSetter ? ' (get/set)' : ''}`,
      t: handle.name,
      h: `${normalizedBase}/reference/api/typescript/${pkgSlug}/${itemSlug}/#${getTsMemberAnchor(getter.name)}`,
      m: true,
      ...withVersion,
    });
  }

  for (const setter of setters) {
    const hasGetter = getters.some(
      (getter) => getter.name.toLowerCase() === setter.name.replace(/^set/, '').toLowerCase()
    );

    if (hasGetter) {
      continue;
    }

    index.push({
      n: setter.name,
      f: `${handle.name}.${setter.signature ?? setter.name}`,
      k: 'property',
      p: pkgName,
      s: setter.description ?? `Write-only property on ${handle.name}`,
      t: handle.name,
      h: `${normalizedBase}/reference/api/typescript/${pkgSlug}/${itemSlug}/#${getTsMemberAnchor(setter.name)}`,
      m: true,
      ...withVersion,
    });
  }

  for (const method of methods) {
    addHandleMethodEntry(index, method, methods, handle, pkgName, pkgSlug, itemSlug, normalizedBase, withVersion, standaloneFunctionKeys);
  }
}

function addHandleMethodEntry(
  index: TsApiSearchIndexEntry[],
  method: TsFunction,
  methods: TsFunction[],
  handle: TsHandleType,
  pkgName: string,
  pkgSlug: string,
  itemSlug: string,
  normalizedBase: string,
  withVersion: { v?: string },
  standaloneFunctionKeys: Set<string>
): void {
  if (standaloneFunctionKeys.has(getTsCallableIdentityKey(method))) {
    return;
  }

  const memberSlug = getTsMethodSlug(method, methods, handle.name);
  if (!memberSlug) {
    return;
  }

  index.push({
    n: method.name,
    f: `${handle.name}.${method.signature ?? method.qualifiedName ?? method.name}`,
    k: 'method',
    p: pkgName,
    s: method.description ?? '',
    t: handle.name,
    h: `${normalizedBase}/reference/api/typescript/${pkgSlug}/${itemSlug}/${memberSlug}/`,
    m: true,
    ...withVersion,
  });
}