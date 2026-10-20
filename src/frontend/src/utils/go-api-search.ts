import type { GoApiDocument, GoFunction, GoHandleType } from './go-modules';
import type { GoApiSearchIndexEntry } from './go-api-search-stats';
import { goModuleSlug } from './go-modules';
import { toSearchGoDocText } from './go-doc-text';
import {
  getGoCallableIdentityKey,
  getGoFunctionDisplayKind,
} from './go-api-function-kind';
import {
  getGoItemSlug,
  getGoMemberAnchor,
  getGoMethods,
  getGoMethodSlug,
  getGoStandaloneFunctions,
  getGoTopLevelRouteItems,
} from './go-api-routes';

export type { GoApiSearchIndexEntry } from './go-api-search-stats';

export function buildGoApiSearchIndex(packages: GoApiDocument[], base = ''): GoApiSearchIndexEntry[] {
  const normalizedBase = base.replace(/\/$/, '');
  const index: GoApiSearchIndexEntry[] = [];

  for (const pkg of packages) {
    const pkgName = pkg.package.name;
    const pkgSlug = goModuleSlug(pkgName);
    const topLevelItems = getGoTopLevelRouteItems(pkg);
    const version = pkg.package.version;
    const withVersion = version ? { v: version } : {};
    const standaloneFunctions = getGoStandaloneFunctions(pkg);
    const standaloneFunctionKeys = new Set(
      standaloneFunctions.map((fn) => getGoCallableIdentityKey(fn))
    );

    for (const fn of standaloneFunctions) {
      const itemSlug = getGoItemSlug(fn, topLevelItems);
      if (!itemSlug) {
        continue;
      }

      const signature = fn.signature ?? fn.qualifiedName ?? fn.name;
      // Go has no free-standing builder functions: the receiver identifies which
      // `WithHostPort` a result is, so it is part of the full name and parent label.
      index.push({
        n: fn.name,
        f: fn.receiver ? `${fn.receiver}.${signature}` : signature,
        k: getGoFunctionDisplayKind(fn),
        p: pkgName,
        s: toSearchGoDocText(fn.description ?? ''),
        h: `${normalizedBase}/reference/api/go/${pkgSlug}/${itemSlug}/`,
        ...(fn.receiver ? { t: fn.receiver } : {}),
        ...withVersion,
      });
    }

    for (const handle of pkg.handleTypes ?? []) {
      const itemSlug = getGoItemSlug(handle, topLevelItems);
      if (!itemSlug) {
        continue;
      }

      const qualifiers = [handle.isInterface && 'interface', handle.isMarker && 'marker'].filter(Boolean);
      index.push({
        n: handle.name,
        f: handle.fullName ?? handle.name,
        k: handle.isInterface ? 'interface' : 'handle',
        p: pkgName,
        s: toSearchGoDocText(handle.description ?? `Handle type${qualifiers.length > 0 ? ` (${qualifiers.join(', ')})` : ''}`),
        h: `${normalizedBase}/reference/api/go/${pkgSlug}/${itemSlug}/`,
        ...withVersion,
      });

      addHandleMemberEntries(index, handle, pkgName, pkgSlug, itemSlug, normalizedBase, withVersion, standaloneFunctionKeys);
    }

    for (const dto of pkg.dtoTypes ?? []) {
      const itemSlug = getGoItemSlug(dto, topLevelItems);
      if (!itemSlug) {
        continue;
      }

      index.push({
        n: dto.name,
        f: dto.fullName ?? dto.name,
        k: 'struct',
        p: pkgName,
        s: toSearchGoDocText(dto.description ?? `Struct with ${dto.fields?.length ?? 0} fields`),
        h: `${normalizedBase}/reference/api/go/${pkgSlug}/${itemSlug}/`,
        ...withVersion,
      });
    }

    for (const enumType of pkg.enumTypes ?? []) {
      const itemSlug = getGoItemSlug(enumType, topLevelItems);
      if (!itemSlug) {
        continue;
      }

      index.push({
        n: enumType.name,
        f: enumType.fullName ?? enumType.name,
        k: 'enum',
        p: pkgName,
        s: toSearchGoDocText(enumType.description ?? `Enum: ${(enumType.members ?? []).map((member) => member.name).join(', ')}`),
        h: `${normalizedBase}/reference/api/go/${pkgSlug}/${itemSlug}/`,
        ...withVersion,
      });
    }
  }

  return index;
}

/** `SetFoo` writes the property read by the `Foo` getter. */
function propertyNameOf(setterName: string): string {
  return setterName.replace(/^Set/, '').toLowerCase();
}

function addHandleMemberEntries(
  index: GoApiSearchIndexEntry[],
  handle: GoHandleType,
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
  const methods = getGoMethods(handle);

  for (const getter of getters) {
    const hasSetter = setters.some(
      (setter) => propertyNameOf(setter.name) === getter.name.toLowerCase()
    );

    index.push({
      n: getter.name,
      f: `${handle.name}.${getter.signature ?? getter.name}`,
      k: 'property',
      p: pkgName,
      s: toSearchGoDocText(getter.description ?? `Property on ${handle.name}${hasSetter ? ' (get/set)' : ''}`),
      t: handle.name,
      h: `${normalizedBase}/reference/api/go/${pkgSlug}/${itemSlug}/#${getGoMemberAnchor(getter.name)}`,
      m: true,
      ...withVersion,
    });
  }

  for (const setter of setters) {
    const hasGetter = getters.some(
      (getter) => getter.name.toLowerCase() === propertyNameOf(setter.name)
    );

    if (hasGetter) {
      continue;
    }

    index.push({
      n: setter.name,
      f: `${handle.name}.${setter.signature ?? setter.name}`,
      k: 'property',
      p: pkgName,
      s: toSearchGoDocText(setter.description ?? `Write-only property on ${handle.name}`),
      t: handle.name,
      h: `${normalizedBase}/reference/api/go/${pkgSlug}/${itemSlug}/#${getGoMemberAnchor(setter.name)}`,
      m: true,
      ...withVersion,
    });
  }

  for (const method of methods) {
    addHandleMethodEntry(index, method, methods, handle, pkgName, pkgSlug, itemSlug, normalizedBase, withVersion, standaloneFunctionKeys);
  }
}

function addHandleMethodEntry(
  index: GoApiSearchIndexEntry[],
  method: GoFunction,
  methods: GoFunction[],
  handle: GoHandleType,
  pkgName: string,
  pkgSlug: string,
  itemSlug: string,
  normalizedBase: string,
  withVersion: { v?: string },
  standaloneFunctionKeys: Set<string>
): void {
  // The standalone function is the canonical, searchable entry for a capability.
  if (standaloneFunctionKeys.has(getGoCallableIdentityKey(method))) {
    return;
  }

  const memberSlug = getGoMethodSlug(method, methods, handle.name);
  if (!memberSlug) {
    return;
  }

  index.push({
    n: method.name,
    f: `${handle.name}.${method.signature ?? method.qualifiedName ?? method.name}`,
    k: 'method',
    p: pkgName,
    s: toSearchGoDocText(method.description ?? ''),
    t: handle.name,
    h: `${normalizedBase}/reference/api/go/${pkgSlug}/${itemSlug}/${memberSlug}/`,
    m: true,
    ...withVersion,
  });
}
