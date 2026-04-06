/* ------------------------------------------------------------------ */
/*  Shared helpers for the auto-generated API-reference pages.        */
/* ------------------------------------------------------------------ */

import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';

export interface GenericParameter {
  name: string;
}

export interface PackageParameter {
  type: string;
}

export interface PackageMember {
  name: string;
  kind?: string;
  parameters?: PackageParameter[];
}

export interface PackageEnumMember {
  name: string;
}

export interface PackageType {
  name: string;
  kind: string;
  namespace?: string;
  fullName?: string;
  isGeneric?: boolean;
  genericParameters?: GenericParameter[];
  members?: PackageMember[];
  enumMembers?: PackageEnumMember[];
}

export interface PackageMetadata {
  name: string;
  version: string;
  targetFramework: string;
  sourceRepository?: string;
  sourceCommit?: string;
}

export interface PackageApiDocument {
  package: PackageMetadata;
  types: PackageType[];
}

export type PackageCollectionEntry = Omit<CollectionEntry<'packages'>, 'data'> & {
  data: PackageApiDocument;
};

let packagesPromise: Promise<PackageCollectionEntry[]> | undefined;
const shouldCachePackages = import.meta.env.PROD;

/**
 * Fetch all package entries from the content collection.
 * Memoized so Astro's many API routes reuse a single collection load.
 */
export function getPackages(): Promise<PackageCollectionEntry[]> {
  if (!shouldCachePackages) {
    return getCollection('packages') as Promise<PackageCollectionEntry[]>;
  }

  packagesPromise ??= getCollection('packages') as Promise<PackageCollectionEntry[]>;
  return packagesPromise;
}

/** Count generic type parameters on a type object. */
export function genericArity(type: { genericParameters?: GenericParameter[] }): number {
  return type.genericParameters?.length ?? 0;
}

/** Display name including generic type parameters (e.g. `InteractionResult<T>`). */
export function typeDisplayName(type: {
  name: string;
  isGeneric?: boolean;
  genericParameters?: { name: string }[];
}): string {
  return type.isGeneric && type.genericParameters?.length
    ? `${type.name}<${type.genericParameters.map((g) => g.name).join(', ')}>`
    : type.name;
}

/**
 * Convert a PascalCase type name to a lowercase URL slug.
 * When `arity` > 0, appends `-N` to disambiguate generic types
 * (e.g. `InteractionResult<T>` → `interactionresult-1`).
 */
export function slugify(name: string, arity: number = 0): string {
  const slug = name.toLowerCase();
  return arity > 0 ? `${slug}-${arity}` : slug;
}

/** Normalize a NuGet package name for use in a URL path segment. */
export function packageSlug(name: string): string {
  return name.toLowerCase();
}

/* ---- kind helpers ------------------------------------------------ */

export const kindOrder = [
  'class',
  'record',
  'record struct',
  'struct',
  'interface',
  'enum',
  'delegate',
] as const;

export const kindLabels: Record<string, string> = {
  class: 'Classes',
  record: 'Records',
  'record struct': 'Record Structs',
  struct: 'Structs',
  interface: 'Interfaces',
  enum: 'Enums',
  delegate: 'Delegates',
};

export const memberKindOrder = [
  'constructor',
  'property',
  'method',
  'field',
  'event',
  'indexer',
] as const;

export const memberKindLabels: Record<string, string> = {
  constructor: 'Constructors',
  property: 'Properties',
  method: 'Methods',
  field: 'Fields',
  event: 'Events',
  indexer: 'Indexers',
};

/** URL-safe plural slug for each member kind. */
export const memberKindSlugs: Record<string, string> = {
  constructor: 'constructors',
  property: 'properties',
  method: 'methods',
  field: 'fields',
  event: 'events',
  indexer: 'indexers',
};

/* ---- type helpers ------------------------------------------------ */

/** Group an array of types by their `kind`, maintaining a meaningful order. */
export function groupTypesByKind(types: PackageType[]): Map<string, PackageType[]> {
  const groups = new Map<string, PackageType[]>();
  for (const kind of kindOrder) {
    const matching = types.filter((t) => t.kind === kind);
    if (matching.length > 0) {
      groups.set(
        kind,
        matching.sort((a, b) => a.name.localeCompare(b.name))
      );
    }
  }
  return groups;
}

/**
 * Group types by their `namespace`, sorted alphabetically.
 * Each namespace maps to its types sorted by name.
 */
export function groupTypesByNamespace(types: PackageType[]): Map<string, PackageType[]> {
  const nsMap = new Map<string, PackageType[]>();
  for (const t of types) {
    const ns = t.namespace || '(global)';
    const list = nsMap.get(ns) ?? [];
    list.push(t);
    nsMap.set(ns, list);
  }
  // Sort namespace keys alphabetically, sort types within each
  const sorted = new Map(
    [...nsMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ns, ts]) => [ns, ts.sort((a, b) => a.name.localeCompare(b.name))])
  );
  return sorted;
}

/**
 * Generate a URL-safe anchor slug for a member.
 * Includes parameter types for indexers, methods, and constructors to
 * disambiguate overloads.
 */
export function memberSlug(member: {
  name: string;
  kind?: string;
  parameters?: { type: string }[];
}): string {
  let base = member.name === '.ctor' ? 'constructor' : member.name;
  if (member.kind === 'indexer' && member.parameters?.length) {
    const paramTypes = member.parameters.map((p) => shortTypeName(p.type)).join(', ');
    base = `this[${paramTypes}]`;
  } else if ((member.kind === 'method' || member.kind === 'constructor') && member.parameters) {
    const paramTypes = member.parameters.map((p) => shortTypeName(p.type)).join(', ');
    base = `${base}(${paramTypes})`;
  }
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Display name for a member, including parameter types for indexers,
 * methods, and constructors.
 * e.g. `this[string]`, `Add(string, int)`, `Constructor(ILogger)`.
 */
export function memberDisplayName(member: {
  name: string;
  kind?: string;
  parameters?: { type: string }[];
}): string {
  if (member.kind === 'indexer' && member.parameters?.length) {
    const paramTypes = member.parameters.map((p) => shortTypeName(p.type)).join(', ');
    return `this[${paramTypes}]`;
  }
  if ((member.kind === 'method' || member.kind === 'constructor') && member.parameters) {
    const paramTypes = member.parameters.map((p) => shortTypeName(p.type)).join(', ');
    return `${member.name}(${paramTypes})`;
  }
  return member.name;
}

/** Group members by their `kind`, maintaining a meaningful order. */
export function groupMembersByKind(members: PackageMember[]): Map<string, PackageMember[]> {
  const groups = new Map<string, PackageMember[]>();
  for (const kind of memberKindOrder) {
    const matching = members.filter((m) => m.kind === kind);
    if (matching.length > 0) {
      groups.set(kind, matching);
    }
  }
  return groups;
}

/* ---- link helpers ------------------------------------------------ */

/**
 * Build an absolute href for a type page.
 * `base` is `import.meta.env.BASE_URL` (e.g. `/`).
 */
export function typeHref(
  base: string,
  packageName: string,
  typeName: string,
  arity: number = 0
): string {
  const b = base.replace(/\/$/, '');
  return `${b}/reference/api/csharp/${packageSlug(packageName)}/${slugify(typeName, arity)}/`;
}

/** NuGet package page URL. */
export function nugetHref(packageName: string): string {
  return `https://www.nuget.org/packages/${packageName}`;
}

/**
 * Try to resolve a CLR type string (e.g. `Aspire.Hosting.ApplicationModel.IResource`)
 * to a link within the current reference. Returns `null` when the type is
 * external or cannot be resolved.
 */
export function resolveTypeLink(
  raw: string,
  types: PackageType[],
  base: string,
  packageName: string
): { href: string; label: string } | null {
  // Strip nullable markers and collection wrappers for matching.
  const clean = raw
    .replace(/\?$/, '')
    .replace(/^System\.Threading\.Tasks\.Task<(.+)>$/, '$1')
    .replace(/^System\.Collections\.Generic\.\w+<(.+)>$/, '$1');

  const match = types.find((t) => t.fullName === clean || t.fullName === raw);
  if (match) {
    return {
      href: typeHref(base, packageName, match.name, genericArity(match)),
      label: match.name,
    };
  }
  return null;
}

/**
 * Shorten a fully-qualified generic type name to its simple form.
 *
 * Handles dots inside generic arguments correctly:
 *   `System.IEquatable<SampleApi.ValidationError>`  →  `IEquatable<ValidationError>`
 *   `SampleApi.PagedResult<T>`                      →  `PagedResult<T>`
 */
export function shortTypeName(fullName: string): string {
  let firstAngle = -1;
  for (let i = 0; i < fullName.length; i++) {
    if (fullName[i] === '<') {
      firstAngle = i;
      break;
    }
  }

  if (firstAngle < 0) {
    return fullName.split('.').pop() ?? fullName;
  }

  const outerShort = fullName.slice(0, firstAngle).split('.').pop() ?? fullName;
  const lastAngle = fullName.lastIndexOf('>');
  const argsContent = fullName.slice(firstAngle + 1, lastAngle);

  const args: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of argsContent) {
    if (ch === '<') depth++;
    if (ch === '>') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());

  const shortArgs = args.map((a) => shortTypeName(a));
  return `${outerShort}<${shortArgs.join(', ')}>`;
}

/**
 * Parse a `seeAlso` doc-id reference like `T:SampleApi.Customer` or
 * `P:SampleApi.Customer.Id`.
 */
export function parseSeeAlso(ref: string): {
  prefix: string;
  fullName: string;
  simpleName: string;
} {
  const colon = ref.indexOf(':');
  const prefix = colon > 0 ? ref.slice(0, colon) : '';
  const fullName = colon > 0 ? ref.slice(colon + 1) : ref;
  const simpleName = shortTypeName(fullName);
  return { prefix, fullName, simpleName };
}

/* ---- signature formatting ---------------------------------------- */

/**
 * Strip the declaring-type prefix from a member signature so it reads
 * like source code inside the class body.
 *
 * `public static Foo Bar.Baz(int x)` → `public static Foo Baz(int x)`
 * `public Bar.Bar(int x)`            → `public Bar(int x)`
 *
 * Falls back to the original string if parsing fails or there is
 * nothing to strip.
 */
export function cleanMemberSignature(sig: string): string {
  if (!sig) return sig;

  try {
    // Work on the "prefix" portion — everything before the param list `(`
    const openParen = findParamListOpen(sig);
    const prefixEnd = openParen >= 0 ? openParen : sig.length;
    const prefix = sig.slice(0, prefixEnd);

    // Find the last '.' that sits at generic-depth 0.
    // This dot separates "DeclaringType" from "MemberName".
    let depth = 0;
    let lastDotAt = -1;
    for (let i = 0; i < prefix.length; i++) {
      const ch = prefix[i];
      if (ch === '<') depth++;
      else if (ch === '>') depth--;
      else if (ch === '.' && depth === 0) lastDotAt = i;
    }

    if (lastDotAt < 0) return sig; // no dot → nothing to strip

    // Walk backwards from the dot to find where the declaring type token starts
    // (right after a space — everything before that space is modifiers / return type).
    let typeStart = 0;
    for (let i = lastDotAt - 1; i >= 0; i--) {
      if (prefix[i] === ' ') {
        typeStart = i + 1;
        break;
      }
    }

    // Sanity: if typeStart == lastDotAt there's nothing useful to strip
    if (typeStart >= lastDotAt) return sig;

    return sig.slice(0, typeStart) + sig.slice(lastDotAt + 1);
  } catch {
    return sig; // safe fallback
  }
}

/**
 * Format a C# member signature with parameters on separate lines.
 */
export function formatSignature(sig: string): string {
  if (!sig) return sig;

  const openIdx = findParamListOpen(sig);
  if (openIdx < 0) return sig;

  const closeIdx = sig.lastIndexOf(')');
  if (closeIdx <= openIdx) return sig;

  const prefix = sig.slice(0, openIdx + 1);
  const suffix = sig.slice(closeIdx);
  const paramStr = sig.slice(openIdx + 1, closeIdx);

  const params = splitParams(paramStr);
  if (params.length === 0) return sig;

  const indent = '    ';
  return (
    prefix +
    '\n' +
    params
      .map((p, i) => {
        const sep = i < params.length - 1 ? ',' : '';
        return indent + p.trim() + sep;
      })
      .join('\n') +
    suffix
  );
}

/**
 * Minimal parent-type info needed for class-body signature wrapping.
 */
export interface ParentTypeInfo {
  name: string;
  kind: string;
  accessibility?: string;
  isStatic?: boolean;
  isAbstract?: boolean;
  isSealed?: boolean;
  isGeneric?: boolean;
  genericParameters?: { name: string }[];
}

/**
 * Build a "class-body" formatted signature for methods and constructors.
 *
 * Wraps the cleaned member signature inside a type declaration so readers
 * see the member in context — exactly as it would appear in source code:
 *
 * ```cs
 * public static class AspireConfigurableOpenAIExtensions
 * {
 *     public static AspireOpenAIClientBuilder AddKeyedOpenAIClientFromConfiguration(
 *         this IHostApplicationBuilder builder,
 *         string name)
 *     {
 *         // ...
 *     }
 * }
 * ```
 *
 * Returns `null` when the member kind isn't method/constructor or when
 * parsing fails — the caller should fall back to the flat format.
 */
export function buildClassBodySignature(
  rawSig: string,
  parentType: ParentTypeInfo,
  memberKind: string
): string | null {
  if (!rawSig) return null;

  // Only wrap methods and constructors — properties/fields/events stay flat
  if (memberKind !== 'method' && memberKind !== 'constructor') return null;

  try {
    // ---- Build type declaration line ----
    const mods: string[] = [];
    if (parentType.accessibility) mods.push(parentType.accessibility);
    if (parentType.isStatic) mods.push('static');
    if (parentType.isAbstract && parentType.kind === 'class') mods.push('abstract');
    if (parentType.isSealed && parentType.kind === 'class') mods.push('sealed');
    mods.push(parentType.kind);

    let typeName = parentType.name;
    if (parentType.isGeneric && parentType.genericParameters?.length) {
      typeName += `<${parentType.genericParameters.map((g) => g.name).join(', ')}>`;
    }

    const typeDecl = mods.join(' ') + ' ' + typeName;

    // ---- Clean the member signature (strip declaring-type prefix) ----
    const cleaned = cleanMemberSignature(rawSig);

    // ---- Format parameters with 8-space indent (inside class body) ----
    const openIdx = findParamListOpen(cleaned);
    let memberLine: string;

    if (openIdx < 0) {
      memberLine = '    ' + cleaned;
    } else {
      const closeIdx = cleaned.lastIndexOf(')');
      if (closeIdx <= openIdx) {
        memberLine = '    ' + cleaned;
      } else {
        const pre = cleaned.slice(0, openIdx + 1);
        const suf = cleaned.slice(closeIdx);
        const paramStr = cleaned.slice(openIdx + 1, closeIdx);
        const params = splitParams(paramStr);

        if (params.length === 0) {
          memberLine = '    ' + cleaned;
        } else {
          memberLine =
            '    ' +
            pre +
            '\n' +
            params
              .map((p, i) => {
                const sep = i < params.length - 1 ? ',' : '';
                return '        ' + p.trim() + sep;
              })
              .join('\n') +
            suf;
        }
      }
    }

    return typeDecl + '\n{\n' + memberLine + '\n    {\n        // ...\n    }\n}';
  } catch {
    return null;
  }
}

function findParamListOpen(sig: string): number {
  let depth = 0;
  for (let i = 0; i < sig.length; i++) {
    const ch = sig[i];
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    else if (ch === '(' && depth === 0) return i;
  }
  return -1;
}

function splitParams(paramStr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of paramStr) {
    if (ch === '<' || ch === '(') depth++;
    else if (ch === '>' || ch === ')') depth--;

    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/* ---- code formatting --------------------------------------------- */

/**
 * Remove common leading whitespace from a multi-line code string.
 */
export function dedent(code: string): string {
  if (!code) return code;
  const lines = code.split('\n');
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const leading = line.match(/^(\s+)/);
    if (leading && leading[1].length < minIndent) {
      minIndent = leading[1].length;
    }
  }
  if (minIndent === 0 || minIndent === Infinity) return code;
  return lines
    .map((line) => {
      if (line.trim().length === 0) return '';
      return line.startsWith(' '.repeat(minIndent)) ? line.slice(minIndent) : line;
    })
    .join('\n');
}
