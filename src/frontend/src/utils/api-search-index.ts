import type { PackageApiDocument, PackageType } from './packages';
import type { TsApiDocument } from './ts-modules';
import { genericArity, slugify } from './csharp-route-identity';
import { memberNameSlug, resolveMemberAnchors } from './api-member-anchors';
import { getTsCallableIdentityKey, getTsFunctionDisplayKind } from './ts-api-function-kind';
import {
  getTsItemSlug,
  getTsMethods,
  getTsMethodSlug,
  getTsStandaloneFunctions,
  getTsTopLevelRouteItems,
} from './ts-api-routes';
import { tsModuleSlug } from './ts-modules';

/** Where the browser loads a page's search index from. */
export function apiSearchIndexUrl(base: string, language: 'csharp' | 'typescript', slug?: string): string {
  const normalizedBase = base.replace(/\/$/, '');
  return `${normalizedBase}/reference/api-search/${language}${slug ? `/${slug}` : ''}.json`;
}

export function apiSearchIndexResponse(entries: ReadonlyArray<unknown>): Response {
  return new Response(JSON.stringify(entries), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Extract plain-text summary from doc nodes. */
export function extractSummary(summary: unknown): string {
  if (!summary || !Array.isArray(summary)) return '';
  return summary
    .map((node: { kind?: string; text?: string; value?: string }) => {
      if (node.kind === 'text') return node.text;
      if (node.kind === 'cref') return node.value?.split('.').pop() ?? '';
      if (node.kind === 'paramref' || node.kind === 'typeparamref') return node.value ?? '';
      if (node.kind === 'langword') return node.value ?? '';
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export interface CSharpApiSearchEntry {
  n: string;
  f: string;
  ns: string;
  k: string;
  p: string;
  s: string;
  t?: string;
  v?: string;
  a?: string;
  g?: string;
  ts?: string;
}

/** The whole C# catalog, as shown on the C# API landing page. */
export function buildCSharpApiSearchIndex(packages: PackageApiDocument[]): {
  index: CSharpApiSearchEntry[];
  typeCount: number;
  memberCount: number;
} {
  const index: CSharpApiSearchEntry[] = [];
  let typeCount = 0;
  let memberCount = 0;

  for (const pkg of packages) {
    const pkgName = pkg.package.name;
    const pkgVersion = pkg.package.version;
    for (const type of pkg.types) {
      typeCount++;
      const typeSlug = slugify(type.name, genericArity(type));
      index.push({
        n: type.name,
        f: type.fullName ?? type.name,
        ns: type.namespace ?? '',
        k: type.kind ?? 'class',
        p: pkgName,
        s: extractSummary(type.docs?.summary),
        ...(typeSlug !== type.name.toLowerCase() ? { g: typeSlug } : {}),
        ...(pkgVersion ? { v: pkgVersion } : {}),
      });

      // Index members (methods, properties, constructors, fields, events, indexers)
      const members = type.members ?? [];
      const resolvedAnchors = resolveMemberAnchors(members);
      for (const [memberIndex, member] of members.entries()) {
        memberCount++;
        const memberName = member.name === '.ctor' ? `${type.name} (constructor)` : member.name;
        const memberFull = `${type.fullName ?? type.name}.${member.name === '.ctor' ? '.ctor' : member.name}`;
        const anchor = resolvedAnchors[memberIndex].exact;
        const nameAnchor = memberNameSlug(member);
        index.push({
          n: memberName,
          f: memberFull,
          ns: type.namespace ?? '',
          k: member.kind ?? 'method',
          p: pkgName,
          s: extractSummary(member.docs?.summary),
          t: type.name,
          ...(anchor !== nameAnchor ? { a: anchor } : {}),
          ...(typeSlug !== type.name.toLowerCase() ? { ts: typeSlug } : {}),
          ...(pkgVersion ? { v: pkgVersion } : {}),
        });
      }
    }
  }

  return { index, typeCount, memberCount };
}

export type CSharpPackageSearchEntry = Omit<CSharpApiSearchEntry, 'p' | 'v'>;

/** One C# package's types and members, as shown on its package page. */
export function buildCSharpPackageSearchIndex(types: PackageType[]): {
  index: CSharpPackageSearchEntry[];
  memberCount: number;
} {
  const index: CSharpPackageSearchEntry[] = [];
  let memberCount = 0;

  for (const type of types) {
    const typeSlug = slugify(type.name, genericArity(type));
    index.push({
      n: type.name,
      f: type.fullName ?? type.name,
      ns: type.namespace ?? '',
      k: type.kind ?? 'class',
      s: extractSummary(type.docs?.summary),
      ...(typeSlug !== type.name.toLowerCase() ? { g: typeSlug } : {}),
    });

    const members = type.members ?? [];
    const memberAnchors = resolveMemberAnchors(members);
    for (const [memberIndex, member] of members.entries()) {
      memberCount++;
      const memberName = member.name === '.ctor' ? `${type.name} (constructor)` : member.name;
      const memberFull = `${type.fullName ?? type.name}.${member.name === '.ctor' ? '.ctor' : member.name}`;
      const slug = memberAnchors[memberIndex].exact;
      const defaultSlug = memberName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      index.push({
        n: memberName,
        f: memberFull,
        ns: type.namespace ?? '',
        k: member.kind ?? 'method',
        s: extractSummary(member.docs?.summary),
        t: type.name,
        ...(slug !== defaultSlug ? { a: slug } : {}),
        ...(typeSlug !== type.name.toLowerCase() ? { ts: typeSlug } : {}),
      });
    }
  }

  return { index, memberCount };
}

export interface TsModuleSearchEntry {
  n: string;
  f: string;
  ns: string;
  k: string;
  s: string;
  t?: string;
  h?: string;
}

function namespaceOf(fullName: string): string {
  const lastDot = fullName.lastIndexOf('.');
  return lastDot > 0 ? fullName.slice(0, lastDot) : fullName;
}

function moduleOf(capabilityId: string): string {
  const slashIndex = capabilityId.indexOf('/');
  return slashIndex > 0 ? capabilityId.slice(0, slashIndex) : capabilityId;
}

function capabilityKindToSearchKind(capabilityKind: string): string {
  switch (capabilityKind) {
    case 'PropertyGetter':
    case 'PropertySetter':
      return 'property';
    case 'Method':
    case 'InstanceMethod':
      return 'method';
    default:
      return capabilityKind.toLowerCase();
  }
}

/** One TypeScript module's types, enums, functions and members, as shown on its module page. */
export function buildTsModuleSearchIndex(pkg: TsApiDocument, base = ''): {
  index: TsModuleSearchEntry[];
  memberCount: number;
} {
  const normalizedBase = base.replace(/\/$/, '');
  const pkgSlug = tsModuleSlug(pkg.package.name);
  const topLevelItems = getTsTopLevelRouteItems(pkg);
  const standaloneFunctions = getTsStandaloneFunctions(pkg);
  const standaloneFunctionKeys = new Set(standaloneFunctions.map((fn) => getTsCallableIdentityKey(fn)));
  const itemHref = (item: Parameters<typeof getTsItemSlug>[0]) =>
    `${normalizedBase}/reference/api/typescript/${pkgSlug}/${getTsItemSlug(item, topLevelItems)}/`;
  const index: TsModuleSearchEntry[] = [];
  let memberCount = 0;

  for (const handle of pkg.handleTypes ?? []) {
    const typeHref = itemHref(handle);
    const methods = getTsMethods(handle);

    index.push({
      n: handle.name,
      f: handle.fullName ?? handle.name,
      ns: namespaceOf(handle.fullName ?? handle.name),
      k: handle.isInterface ? 'interface' : 'handle',
      s: (handle.description ?? '').slice(0, 160),
      h: typeHref,
    });

    for (const capability of handle.capabilities ?? []) {
      if ((capability.kind === 'Method' || capability.kind === 'InstanceMethod')
        && standaloneFunctionKeys.has(getTsCallableIdentityKey(capability))) {
        continue;
      }

      memberCount++;
      const memberName = capability.name ?? capability.capabilityId?.split('/').pop() ?? '';
      const memberHref = capability.kind === 'Method' || capability.kind === 'InstanceMethod'
        ? `${typeHref}${getTsMethodSlug(capability, methods, handle.name)}/`
        : typeHref;

      index.push({
        n: memberName,
        f: `${handle.fullName ?? handle.name}.${memberName}`,
        ns: namespaceOf(handle.fullName ?? handle.name),
        k: capabilityKindToSearchKind(capability.kind ?? 'method'),
        s: (capability.description ?? '').slice(0, 160),
        t: handle.name,
        h: memberHref,
      });
    }
  }

  for (const dto of pkg.dtoTypes ?? []) {
    index.push({
      n: dto.name,
      f: dto.fullName ?? dto.name,
      ns: namespaceOf(dto.fullName ?? dto.name),
      k: 'type',
      s: (dto.description ?? '').slice(0, 160),
      h: itemHref(dto),
    });
  }

  for (const enumType of pkg.enumTypes ?? []) {
    index.push({
      n: enumType.name,
      f: enumType.fullName ?? enumType.name,
      ns: namespaceOf(enumType.fullName ?? enumType.name),
      k: 'enum',
      s: (enumType.description ?? '').slice(0, 160),
      h: itemHref(enumType),
    });
  }

  for (const fn of standaloneFunctions) {
    index.push({
      n: fn.name,
      f: fn.qualifiedName ?? fn.name,
      ns: moduleOf(fn.capabilityId ?? fn.name),
      k: getTsFunctionDisplayKind(fn),
      s: (fn.description ?? '').slice(0, 160),
      h: itemHref(fn),
    });
  }

  return { index, memberCount };
}
