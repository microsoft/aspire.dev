/* ------------------------------------------------------------------ */
/*  Shared helpers for the auto-generated Go API reference.            */
/* ------------------------------------------------------------------ */

import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';
import {
  getGoItemSlug,
  getGoTopLevelRouteItems,
  getGoTypeByName,
  goSlugify,
  prepareGoApiRoutes,
} from '@utils/go-api-routes';

export { goSlugify };

/**
 * Preview notice shown on the Go API index and module pages (HTML and markdown).
 * Set this to an empty string when the Go AppHost SDK leaves preview to remove it everywhere.
 */
export const GO_EXPERIMENTAL_NOTE: string = 'The Go AppHost SDK is experimental.';

/** Group name for functions that have no receiver, such as `CreateBuilder`. */
export const GO_PACKAGE_FUNCTIONS_GROUP = 'Package functions';

export interface GoFunctionParameter {
  name: string;
  type?: string;
  isCallback?: boolean;
  callbackSignature?: string;
  description?: string;
}

export interface GoOptionField {
  name: string;
  jsonName?: string;
  type?: string;
  isCallback?: boolean;
  callbackSignature?: string;
  description?: string;
}

/** Optional parameters collapse into a trailing `opts ...*XxxOptions` struct. */
export interface GoCallableOptions {
  typeName: string;
  /** True when the options type is an existing DTO rather than a generated struct. */
  isDirect?: boolean;
  fields?: GoOptionField[];
}

export interface GoFunction {
  name: string;
  kind?: string;
  qualifiedName?: string;
  capabilityId?: string;
  targetTypeId?: string;
  expandedTargetTypes?: string[];
  appliesTo?: string[];
  /** The Go type carrying the method. Only package-level functions such as `CreateBuilder` have none. */
  receiver?: string | null;
  signature?: string;
  description?: string;
  remarks?: string;
  parameters?: GoFunctionParameter[];
  options?: GoCallableOptions | null;
  returnType?: string;
  returns?: string;
  /** `returned` = `(T, error)`; `deferred` = handle result, check `Err()` later; `none`. */
  errorModel?: string;
  returnsReceiver?: boolean;
  returnsBuilder?: boolean;
}

export interface GoNamedItem {
  name: string;
  fullName?: string;
  kind?: string;
  description?: string;
  remarks?: string;
}

export interface GoSynthesizedMember {
  name: string;
  signature?: string;
  description?: string;
}

export interface GoHandleType extends GoNamedItem {
  kind?: 'handle';
  isInterface?: boolean;
  isMarker?: boolean;
  implementedInterfaces?: string[];
  capabilities?: GoFunction[];
  synthesizedMembers?: GoSynthesizedMember[];
}

export interface GoField {
  name: string;
  jsonName?: string;
  type?: string;
  isOptional?: boolean;
  isCallback?: boolean;
  description?: string;
}

export interface GoDtoType extends GoNamedItem {
  kind?: 'dto';
  fields?: GoField[];
}

export interface GoEnumMember {
  name: string;
  value: string;
  description?: string;
  remarks?: string;
}

export interface GoEnumType extends GoNamedItem {
  kind?: 'enum';
  members?: GoEnumMember[];
}

export interface GoExportedValueEntry {
  path: string;
  type?: string;
  /** A Go literal such as `"\"build\""`. */
  value?: string;
  description?: string;
}

/** Exposed by the SDK as `WellKnownPipelineSteps.Build`; they have no pages of their own. */
export interface GoExportedValue extends GoNamedItem {
  kind?: 'exportedValue';
  values?: GoExportedValueEntry[];
}

export interface GoModulePackage {
  name: string;
  version?: string;
  language?: string;
  importPath?: string;
  sourceRepository?: string;
  sourceCommit?: string;
}

export interface GoApiDocument {
  package: GoModulePackage;
  functions?: GoFunction[];
  handleTypes?: GoHandleType[];
  dtoTypes?: GoDtoType[];
  enumTypes?: GoEnumType[];
  exportedValues?: GoExportedValue[];
}

export type GoModuleCollectionEntry = Omit<CollectionEntry<'goModules'>, 'data'> & {
  data: GoApiDocument;
};

let goModulesPromise: Promise<GoModuleCollectionEntry[]> | undefined;
const shouldCacheGoModules = import.meta.env.PROD;

/**
 * Fetch all Go module entries from the content collection.
 * Memoized so Astro's many API routes reuse a single collection load.
 */
export function getGoModules(): Promise<GoModuleCollectionEntry[]> {
  if (!shouldCacheGoModules) {
    return getCollection('goModules');
  }

  goModulesPromise ??= getCollection('goModules').then((entries) => {
    for (const entry of entries) prepareGoApiRoutes(entry.data);
    return entries;
  });
  return goModulesPromise;
}

/** Normalize a module name for use in a URL path segment. */
export function goModuleSlug(name: string): string {
  return name.toLowerCase();
}

/* ---- Capability kind helpers ---------------------------------------- */

/** Ordered list of capability kinds for consistent display. */
export const goCapabilityKindOrder = [
  'Method',
  'InstanceMethod',
  'PropertyGetter',
  'PropertySetter',
] as const;

export const goCapabilityKindLabels: Record<string, string> = {
  Method: 'Methods',
  InstanceMethod: 'Instance Methods',
  PropertyGetter: 'Property Getters',
  PropertySetter: 'Property Setters',
};

/* ---- Type kind helpers ---------------------------------------------- */

export const goTypeKindOrder = ['handle', 'dto', 'enum'] as const;

export const goTypeKindLabels: Record<string, string> = {
  handle: 'Handles',
  dto: 'DTOs',
  enum: 'Enums',
};

/* ---- Grouping helpers ----------------------------------------------- */

/**
 * Group standalone functions by the Go type that carries them. Functions without a
 * receiver (`CreateBuilder`) form a `Package functions` group, listed first.
 */
export function groupGoFunctionsByReceiver(functions: GoFunction[]): Map<string, GoFunction[]> {
  const byReceiver = new Map<string, GoFunction[]>();
  for (const func of functions) {
    const receiver = func.receiver || GO_PACKAGE_FUNCTIONS_GROUP;
    const existing = byReceiver.get(receiver) ?? [];
    existing.push(func);
    byReceiver.set(receiver, existing);
  }

  const names = [...byReceiver.keys()].sort((left, right) => {
    if (left === GO_PACKAGE_FUNCTIONS_GROUP) return right === GO_PACKAGE_FUNCTIONS_GROUP ? 0 : -1;
    if (right === GO_PACKAGE_FUNCTIONS_GROUP) return 1;
    return left.localeCompare(right);
  });

  const groups = new Map<string, GoFunction[]>();
  for (const name of names) {
    const funcs = byReceiver.get(name) ?? [];
    funcs.sort((a, b) => a.name.localeCompare(b.name));
    groups.set(name, funcs);
  }

  return groups;
}

/**
 * Types an interface or marker handle applies to: the union of its capabilities'
 * `appliesTo`, sorted. Handles without capabilities have an empty list.
 */
export function getGoHandleAppliesTo(handle: GoHandleType): string[] {
  const names = new Set<string>();
  for (const capability of handle.capabilities ?? []) {
    for (const name of capability.appliesTo ?? []) names.add(name);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

/**
 * Number of members a handle page lists: a getter and its `SetX` setter are one property,
 * and the hand-written SDK helpers count as methods.
 */
export function countGoHandleMembers(handle: GoHandleType): number {
  const capabilities = handle.capabilities ?? [];
  const getterNames = new Set<string>();
  let getters = 0;
  let methods = 0;
  for (const capability of capabilities) {
    if (capability.kind === 'PropertyGetter') {
      getters++;
      getterNames.add(capability.name.toLowerCase());
    } else if (capability.kind === 'Method' || capability.kind === 'InstanceMethod') {
      methods++;
    }
  }
  const setterOnly = capabilities.filter(
    (capability) =>
      capability.kind === 'PropertySetter' && !getterNames.has(capability.name.replace(/^Set/, '').toLowerCase())
  ).length;
  return getters + setterOnly + methods + (handle.synthesizedMembers?.length ?? 0);
}

/**
 * Distinct `package.importPath` values across modules, sorted. Every module currently
 * shares one flat import path, but the index copy must not assume that.
 */
export function getGoImportPaths(modules: GoApiDocument[]): string[] {
  const paths = new Set<string>();
  for (const doc of modules) {
    if (doc.package.importPath) paths.add(doc.package.importPath);
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

/**
 * Name of the trailing variadic options parameter, read from the signature because it
 * differs per callable: `opts ...*WithDataVolumeOptions` vs `options ...*CreateBuilderOptions`.
 */
export function getGoOptionsParameterName(callable: Pick<GoFunction, 'signature' | 'options'>): string {
  const typeName = callable.options?.typeName;
  if (typeName && callable.signature) {
    const match = new RegExp(`([A-Za-z_][A-Za-z0-9_]*)\\s+\\.\\.\\.\\*?${typeName}\\b`).exec(callable.signature);
    if (match) return match[1];
  }
  return 'opts';
}

/**
 * Value type of a property accessor. A getter returns `(T, error)` or, for deferred
 * results, a bare `T`; a setter takes the value as its first parameter.
 */
export function getGoPropertyValueType(
  accessor: Pick<GoFunction, 'kind' | 'returnType' | 'parameters'>
): string | undefined {
  if (accessor.kind === 'PropertySetter') {
    return accessor.parameters?.[0]?.type;
  }

  const returnType = accessor.returnType?.trim();
  if (!returnType) {
    return undefined;
  }

  // `(*float64, error)` -> `*float64`; only the trailing `, error)` is removed so
  // generic arguments such as `*Dictionary[string, string]` stay intact.
  const tuple = /^\((.+),\s*error\)$/.exec(returnType);
  return tuple ? tuple[1].trim() : returnType;
}

/* ---- Link helpers --------------------------------------------------- */

/**
 * Build an absolute href for a Go API module page.
 */
export function goModuleHref(base: string, moduleName: string): string {
  const b = base.replace(/\/$/, '');
  return `${b}/reference/api/go/${goModuleSlug(moduleName)}/`;
}

/**
 * Build an absolute href for a Go API type/function page.
 */
export function goItemHref(base: string, moduleName: string, itemName: string): string {
  const b = base.replace(/\/$/, '');
  return `${b}/reference/api/go/${goModuleSlug(moduleName)}/${goSlugify(itemName)}/`;
}

/**
 * Resolve the page of a type declared in the same module, honouring slug
 * disambiguation. Types declared in other modules have no page here.
 */
export function getGoTypeHref(base: string, doc: GoApiDocument, typeName: string): string | undefined {
  const type = getGoTypeByName(doc, typeName);
  if (!type) return undefined;
  const slug = getGoItemSlug(type, getGoTopLevelRouteItems(doc));
  const b = base.replace(/\/$/, '');
  return `${b}/reference/api/go/${goModuleSlug(doc.package.name)}/${slug}/`;
}

/**
 * Split a Go type reference such as `*RedisResource` or `[]DistributedApplicationBuilder`
 * into its pointer/slice prefix and the type name. Returns undefined for anything
 * more complex (`map[string]string`, `*List[string]`, `func(...)`, tuples).
 */
export function parseGoTypeReference(typeText: string | undefined): { prefix: string; name: string } | undefined {
  const match = /^((?:\*|\[\])*)([A-Za-z_][A-Za-z0-9_]*)$/.exec((typeText ?? '').trim());
  return match ? { prefix: match[1], name: match[2] } : undefined;
}

/* ---- Text helpers --------------------------------------------------- */

/**
 * Close an unterminated ``` fence. Descriptions and remarks come from XML docs and
 * can contain an odd number of fences; left alone, the dangling fence would swallow
 * every section that follows it in the generated page.
 */
export function closeUnclosedCodeFences(text: string): string {
  let openFence: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (openFence) {
      const close = /^ {0,3}(`{3,})[ \t]*$/.exec(line);
      if (close && close[1].length >= openFence.length) openFence = undefined;
      continue;
    }

    const open = /^ {0,3}(`{3,})[^`]*$/.exec(line);
    if (open) openFence = open[1];
  }

  return openFence ? `${text.replace(/\s+$/, '')}\n${openFence}` : text;
}

/* ---- Error model ---------------------------------------------------- */

/**
 * Plain-words description of how a callable reports failure.
 *
 * `errorModel` values:
 *   deferred - returns a handle; failures surface later via `Err()`
 *   returned - returns `(T, error)` (or just `error`)
 *   none     - no error is reported
 */
export function describeGoErrorModel(callable: Pick<GoFunction, 'errorModel' | 'returnType'>): string {
  const returnType = callable.returnType?.trim() ?? '';

  if (returnType === 'error') {
    return 'Returns `error`.';
  }

  switch (callable.errorModel) {
    case 'deferred':
      return 'Returns a handle; failures surface later via `Err()`.';
    case 'returned': {
      const tuple = returnType.startsWith('(') ? returnType : `(${returnType || 'T'}, error)`;
      return `Returns \`${tuple}\`.`;
    }
    default:
      return returnType
        ? `Returns \`${returnType}\`; no error is reported.`
        : 'No error is reported.';
  }
}

/* ---- Signature formatting ------------------------------------------- */

const OPENING_BRACKETS = '([{';
const CLOSING_BRACKETS = ')]}';

/**
 * Format a Go signature (no `func` keyword) for display.
 * With 2+ parameters each one goes on its own line with a trailing comma and a
 * 4-space indent, matching the C# and TypeScript reference formatting:
 *
 *   WithDataBindMount(source string, opts ...*Options) RedisInsightResource
 *   WithDataBindMount(
 *       source string,
 *       opts ...*Options,
 *   ) RedisInsightResource
 */
export function formatGoSignature(sig: string): string {
  if (!sig) return sig;

  // The parameter list opens at the first `(` outside type parameters (`Name[T any](...)`).
  let openIdx = -1;
  let bracketDepth = 0;
  for (let i = 0; i < sig.length; i++) {
    const ch = sig[i];
    if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
    else if (ch === '(' && bracketDepth === 0) {
      openIdx = i;
      break;
    }
  }
  if (openIdx < 0) return sig;

  // Find the matching close paren (respecting nested callback types)
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < sig.length; i++) {
    const ch = sig[i];
    if (OPENING_BRACKETS.includes(ch)) depth++;
    else if (CLOSING_BRACKETS.includes(ch)) depth--;
    if (depth === 0) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx <= openIdx) return sig;

  const prefix = sig.slice(0, openIdx + 1);
  const suffix = sig.slice(closeIdx);
  const paramStr = sig.slice(openIdx + 1, closeIdx);

  // Split params respecting nested parens/brackets (callback types, maps, generics)
  const params: string[] = [];
  let current = '';
  depth = 0;
  for (const ch of paramStr) {
    if (OPENING_BRACKETS.includes(ch)) depth++;
    else if (CLOSING_BRACKETS.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(current.trim());

  // Single param or empty - keep inline
  if (params.length <= 1) return sig;

  // Multi-param - wrap each on its own line (gofmt requires the trailing comma)
  const indent = '    ';
  return `${prefix}\n${params.map((p) => `${indent}${p},`).join('\n')}\n${suffix}`;
}

/* ---- Definition snippets -------------------------------------------- */

const DEFINITION_INDENT = '    ';

function padRight(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - value.length));
}

/** `type Name interface { <embedded interfaces> }`; members are listed on the page, not in the fence. */
export function buildGoHandleDefinition(handle: Pick<GoHandleType, 'name' | 'implementedInterfaces'>): string {
  const embedded = handle.implementedInterfaces ?? [];
  if (embedded.length === 0) {
    return `type ${handle.name} interface{}`;
  }

  return [
    `type ${handle.name} interface {`,
    ...embedded.map((name) => `${DEFINITION_INDENT}${name}`),
    '}',
  ].join('\n');
}

/** A struct with `json:"jsonName"` tags, aligned the way gofmt would. */
export function buildGoDtoDefinition(dto: Pick<GoDtoType, 'name' | 'fields'>): string {
  const fields = dto.fields ?? [];
  if (fields.length === 0) {
    return `type ${dto.name} struct{}`;
  }

  const nameWidth = Math.max(...fields.map((field) => field.name.length));
  const typeWidth = Math.max(...fields.map((field) => (field.type ?? 'any').length));
  return [
    `type ${dto.name} struct {`,
    ...fields.map(
      (field) =>
        `${DEFINITION_INDENT}${padRight(field.name, nameWidth)} ${padRight(field.type ?? 'any', typeWidth)} \`json:"${field.jsonName ?? field.name}"\``
    ),
    '}',
  ].join('\n');
}

/** `type X string` plus a `const ( ... )` block whose names are already the Go constant names. */
export function buildGoEnumDefinition(enumType: Pick<GoEnumType, 'name' | 'members'>): string {
  const members = enumType.members ?? [];
  const declaration = `type ${enumType.name} string`;
  if (members.length === 0) {
    return declaration;
  }

  const nameWidth = Math.max(...members.map((member) => member.name.length));
  return [
    declaration,
    '',
    'const (',
    ...members.map(
      (member) =>
        `${DEFINITION_INDENT}${padRight(member.name, nameWidth)} ${enumType.name} = ${JSON.stringify(member.value)}`
    ),
    ')',
  ].join('\n');
}

/** `func (<receiver>) <signature>`, or `func <signature>` for receiver-less package functions. */
export function buildGoFunctionDefinition(fn: Pick<GoFunction, 'name' | 'receiver' | 'signature'>): string {
  const signature = formatGoSignature(fn.signature ?? `${fn.name}()`);
  return fn.receiver ? `func (${fn.receiver}) ${signature}` : `func ${signature}`;
}

/** The method as it appears inside its handle interface, with the other members elided. */
export function buildGoMemberDefinition(
  parentName: string,
  method: Pick<GoFunction, 'name' | 'signature'>
): string {
  const signature = formatGoSignature(method.signature ?? `${method.name}()`)
    .split('\n')
    .map((line) => `${DEFINITION_INDENT}${line}`)
    .join('\n');
  return [
    `type ${parentName} interface {`,
    `${DEFINITION_INDENT}// ... omitted for brevity`,
    signature,
    '}',
  ].join('\n');
}
