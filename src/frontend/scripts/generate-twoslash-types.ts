/**
 * generate-twoslash-types.ts — Emits a .d.ts bundle describing the Aspire
 * TypeScript SDK surface, consumed by the twoslash plugin so TS code blocks
 * in the docs get accurate hover tooltips.
 *
 * Reads: src/data/ts-modules/*.json (produced by update-ts-api.ts)
 * Writes: .twoslash-types/aspire.d.ts
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = resolve(__dirname, '..', 'src', 'data', 'ts-modules');
const PKGS_DIR = resolve(__dirname, '..', 'src', 'data', 'pkgs');
const OUTPUT_DIR = resolve(__dirname, '..', '.twoslash-types');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'aspire.d.ts');

interface Parameter {
  name: string;
  type: string;
  isOptional?: boolean;
  isNullable?: boolean;
  isCallback?: boolean;
  callbackSignature?: string;
  defaultValue?: string;
}

interface FunctionEntry {
  name: string;
  description?: string;
  kind: 'Method' | 'InstanceMethod' | 'PropertyGetter' | 'PropertySetter';
  signature: string;
  parameters: Parameter[];
  returnType: string;
  returnsBuilder?: boolean;
  targetTypeId: string;
  expandedTargetTypes: string[];
}

interface DtoField {
  name: string;
  type: string;
}

interface DtoType {
  name: string;
  fullName: string;
  kind: 'dto';
  fields: DtoField[];
}

interface EnumType {
  name: string;
  fullName: string;
  kind: 'enum';
  members: string[];
}

interface HandleType {
  name: string;
  fullName: string;
  kind: 'handle';
  exposeProperties?: boolean;
  implementedInterfaces?: string[];
  capabilities?: FunctionEntry[];
}

interface ModuleJson {
  package: { name: string; version: string };
  functions?: FunctionEntry[];
  dtoTypes?: DtoType[];
  enumTypes?: EnumType[];
  handleTypes?: HandleType[];
}

interface PkgTypeEntry {
  name: string;
  kind: string;
  baseType?: string;
}

interface PkgJson {
  types?: PkgTypeEntry[];
}

// ---------- helpers ----------

function lastDotted(id: string): string {
  // Upstream targetTypeIds look like `Aspire.Hosting/Aspire.Hosting.ApplicationModel.Foo`
  // or occasionally `Aspire.Hosting/Dict<string,any>` where the package is separated
  // with `/` and the type with `.`. Take the segment after the last `/`, then after
  // the last `.`.
  const afterSlash = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  const parts = afterSlash.split('.');
  return parts[parts.length - 1];
}

function cleanType(raw: string | undefined): string {
  if (!raw) return 'unknown';
  let s = raw.trim();
  if (!s) return 'unknown';
  // Collapse fully-qualified namespaced identifiers (with '.' and/or '/' separators)
  // to their trailing simple-name segment, in-place — so occurrences inside generic
  // args are handled without swallowing surrounding brackets.
  s = s.replace(
    /[A-Za-z_][A-Za-z0-9_]*(?:[./][A-Za-z_][A-Za-z0-9_]*)+/g,
    (m) => {
      const afterSlash = m.includes('/') ? m.slice(m.lastIndexOf('/') + 1) : m;
      return lastDotted(afterSlash);
    }
  );
  // recover from known junk produced by the upstream generator (stray `]]`)
  s = s.replace(/\]\]+/g, '');
  return s || 'unknown';
}

function camelCase(name: string): string {
  // The JSON dump carries the original C# property names (PascalCase); the TS
  // SDK surfaces them as camelCase after JSON-serialization. Only touch the
  // leading letter so names that are already camelCase pass through unchanged.
  if (!name) return name;
  const first = name[0];
  if (first >= 'A' && first <= 'Z') return first.toLowerCase() + name.slice(1);
  return name;
}

function sanitizeIdentifier(name: string): string {
  // JS reserved words we might collide with when a param is named e.g. 'default'
  const reserved = new Set([
    'default', 'function', 'class', 'new', 'return', 'delete', 'enum', 'package',
    'private', 'protected', 'public', 'static', 'interface', 'in', 'of', 'as'
  ]);
  return reserved.has(name) ? `_${name}` : name;
}

function paramType(p: Parameter): string {
  if (p.isCallback && p.callbackSignature) return cleanType(p.callbackSignature);
  return broadenParamType(cleanType(p.type));
}

function formatParams(params: Parameter[]): string {
  return params
    .map((p) => {
      const name = sanitizeIdentifier(p.name);
      const type = paramType(p);
      const nullable = p.isNullable && !p.isOptional ? ` | null` : '';
      const optMark = p.isOptional ? '?' : '';
      return `${name}${optMark}: ${type}${nullable}`;
    })
    .join(', ');
}

// Primitive types we're safe to collapse into an options-object overload. If any
// param uses a richer type (resource/handle/enum) we keep the positional form.
const PRIMITIVE_TYPES = new Set([
  'string', 'number', 'boolean', 'bigint', 'symbol', 'unknown', 'any',
  'string[]', 'number[]', 'boolean[]',
  'Array<string>', 'Array<number>', 'Array<boolean>',
]);

function isPrimitiveParamType(t: string): boolean {
  return PRIMITIVE_TYPES.has(t.trim());
}

function formatOptionsObject(params: Parameter[]): string {
  const fields = params
    .map((p) => {
      const name = sanitizeIdentifier(p.name);
      return `${name}?: ${paramType(p)}`;
    })
    .join('; ');
  return `options?: { ${fields} }`;
}

// Known upstream data gaps: params that should be optional but aren't marked
// as such in the dumped JSON, keyed by function name. Keep tightly scoped.
const FORCE_OPTIONAL_PARAMS: Record<string, Set<string>> = {
  addProject: new Set(['launchProfileName']),
};

// Known parameter-type overrides — broaden the declared type to match what the
// real SDK accepts but the dumped JSON doesn't encode (string overloads, etc).
const PARAM_TYPE_OVERRIDES: Record<string, Record<string, string>> = {
  withEnvironment: {
    value: 'string | IResourceWithConnectionString | IValueProvider',
  },
  // Accept parameter-resource references in addition to literal strings, matching
  // the real SDK's overload for "publish as an existing Azure resource".
  publishAsExisting: {
    name: 'string | ParameterResource',
    resourceGroup: 'string | ParameterResource',
  },
};

// Global "broaden this type wherever it appears as a parameter" rules. The
// generated SDK accepts a primitive for these in most positions even though
// the dumped C# API surfaces only the resource/handle type.
const PARAM_TYPE_BROADEN: Record<string, string> = {
  ParameterResource: 'string | ParameterResource',
};

function broadenParamType(type: string): string {
  // Only broaden when the declared type is an exact match — don't rewrite
  // generic args or unions, which could change meaning.
  return PARAM_TYPE_BROADEN[type] ?? type;
}

function applyParamOverrides(fnName: string, params: Parameter[]): Parameter[] {
  const forceOpt = FORCE_OPTIONAL_PARAMS[fnName];
  const typeOv = PARAM_TYPE_OVERRIDES[fnName];
  if (!forceOpt && !typeOv) return params;
  return params.map((p) => {
    const next: Parameter = { ...p };
    if (forceOpt?.has(p.name)) next.isOptional = true;
    if (typeOv && typeOv[p.name]) next.type = typeOv[p.name];
    return next;
  });
}

// Decide whether to emit an extra overload that collapses trailing
// optional-primitive params into an options object. Returns the split index
// (number of leading required params to keep positional) or -1 to skip.
// Rules:
//  - `add*` / `with*` / `publish*` methods: any trailing optional tail (≥1) gets
//    collapsed — docs consistently surface these as `addX/withX/publishX(..., options?)`.
//  - other methods: require ≥2 trailing optional params to avoid noisy
//    single-field options overloads.
//  - `with*` / `add*` tails must all be primitive-typed (callback-heavy tails
//    stay positional for readability). `publish*` tails may include callbacks
//    — the docs consistently pass `{ configure: ..., configureSlot: ... }`.
function optionsOverloadSplit(fnName: string, params: Parameter[]): number {
  let firstOpt = -1;
  for (let i = 0; i < params.length; i++) {
    if (params[i].isOptional) {
      firstOpt = i;
      break;
    }
  }
  if (firstOpt < 0) return -1;
  const tail = params.slice(firstOpt);
  const minTail = /^(add|with|publish)[A-Z0-9]/.test(fnName) ? 1 : 2;
  if (tail.length < minTail) return -1;
  // `with*` methods that take a callback (e.g. `withPgAdmin(configureContainer?)`)
  // are consistently invoked in docs as `withX({ configureContainer: cb })`.
  const allowCallbacks = /^(publish|with)[A-Z0-9]/.test(fnName);
  const allowNamedTypes = /^(publish|with|add)[A-Z0-9]/.test(fnName);
  for (const p of tail) {
    if (!p.isOptional) return -1;
    if (p.isCallback) {
      if (!allowCallbacks) return -1;
      continue;
    }
    if (!isPrimitiveParamType(paramType(p)) && !allowNamedTypes) return -1;
  }
  return firstOpt;
}

function extractTypeIdentifiers(expr: string, out: Set<string>): void {
  // after cleanType, tokens are simple identifiers joined by generics/unions/etc.
  const ids = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  for (const id of ids) out.add(id);
}

function jsdoc(lines: Array<string | undefined>, indent = ''): string {
  const filtered = lines.filter((l): l is string => !!l && l.trim().length > 0);
  if (filtered.length === 0) return '';
  const body = filtered.map((l) => `${indent} * ${l}`).join('\n');
  return `${indent}/**\n${body}\n${indent} */\n`;
}

// ---------- load ----------

const files = readdirSync(MODULES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const modules: ModuleJson[] = files.map(
  (f) => JSON.parse(readFileSync(resolve(MODULES_DIR, f), 'utf8')) as ModuleJson
);

console.log(`📚 Loaded ${modules.length} module JSON files`);

// Load class-inheritance metadata from the richer pkgs/*.json dumps. The
// ts-modules JSON captures implemented interfaces but not class-level `extends`,
// so resource types like ViteAppResource lose inherited methods such as
// publishAsDockerFile. Map each class short-name to its base class short-name.
const classBaseByName = new Map<string, string>();
try {
  const pkgFiles = readdirSync(PKGS_DIR).filter((f) => f.endsWith('.json'));
  for (const f of pkgFiles) {
    const pkg = JSON.parse(readFileSync(resolve(PKGS_DIR, f), 'utf8')) as PkgJson;
    for (const t of pkg.types ?? []) {
      if (t.kind !== 'class' || !t.baseType) continue;
      const base = lastDotted(t.baseType).split('<')[0];
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) continue;
      if (!classBaseByName.has(t.name)) classBaseByName.set(t.name, base);
    }
  }
  console.log(`   + ${classBaseByName.size} class-inheritance links from pkgs/`);
} catch {
  // pkgs directory is optional — older snapshots may not include it.
}

// ---------- collect ----------

// Concrete named types we'll emit explicitly.
const dtoTypes: DtoType[] = [];
const enumTypes: EnumType[] = [];
const handleTypes: HandleType[] = [];
const handleByName = new Map<string, HandleType>();
const dtoByName = new Map<string, DtoType>();
const enumByName = new Map<string, EnumType>();
// Track which package each handle originates from, so we can decide whether
// to inject a ContainerResource base (integration packages ship container-backed
// resources whose .NET class extends ContainerResource, but the JSON dump only
// lists implemented interfaces — no class inheritance).
const handlePackage = new Map<string, string>();

// target short name -> methods
const methodsByTarget = new Map<string, FunctionEntry[]>();
// free-floating functions (e.g. createBuilder)
const freeFunctions: FunctionEntry[] = [];
// all referenced type identifiers (for stubs pass)
const referencedTypes = new Set<string>();
// types that take generic params we've observed
const genericArity = new Map<string, number>();

const FREE_FUNCTION_NAMES = new Set(['createBuilder', 'createBuilderWithOptions']);

// Built-in generic container types the ATS tool emits as pseudo-targets — these
// aren't useful in user-facing docs samples (Dict is already modeled as Record<K,V>,
// List as Array<T>), so we skip them when assigning methods to target interfaces.
const SKIP_TARGET_BASES = new Set(['Dict', 'List', 'string[]']);

function targetBaseName(target: string): string {
  // strip generic args and array brackets for the interface name
  const lt = target.indexOf('<');
  const base = lt >= 0 ? target.slice(0, lt) : target;
  return base.replace(/\[\]/g, '');
}

for (const mod of modules) {
  for (const dto of mod.dtoTypes ?? []) {
    if (!dtoByName.has(dto.name)) {
      dtoByName.set(dto.name, dto);
      dtoTypes.push(dto);
    }
  }
  for (const en of mod.enumTypes ?? []) {
    if (!enumByName.has(en.name)) {
      enumByName.set(en.name, en);
      enumTypes.push(en);
    }
  }
  for (const h of mod.handleTypes ?? []) {
    if (!handleByName.has(h.name)) {
      handleByName.set(h.name, h);
      handleTypes.push(h);
      handlePackage.set(h.name, mod.package.name);
    }
  }

  for (const fn of mod.functions ?? []) {
    if (FREE_FUNCTION_NAMES.has(fn.name)) {
      freeFunctions.push(fn);
    } else {
      // Emit on both the declared target (usually an interface like
      // `IContainerFilesDestinationResource`) and every expanded concrete
      // target. Interface targets let subtypes inherit the method; the
      // expansion covers concrete types that don't list the interface.
      const targets = new Set<string>();
      if (fn.targetTypeId) targets.add(lastDotted(fn.targetTypeId));
      for (const t of fn.expandedTargetTypes ?? []) targets.add(lastDotted(t));
      for (const t of targets) {
        const base = targetBaseName(t);
        if (SKIP_TARGET_BASES.has(base)) continue;
        if (!methodsByTarget.has(base)) methodsByTarget.set(base, []);
        methodsByTarget.get(base)!.push(fn);
      }
    }
  }
}

// Collect referenced types from all emitted content so we can stub missing ones.
function visitFn(fn: FunctionEntry): void {
  extractTypeIdentifiers(cleanType(fn.returnType), referencedTypes);
  for (const p of fn.parameters) {
    const t = p.isCallback && p.callbackSignature
      ? cleanType(p.callbackSignature)
      : cleanType(p.type);
    extractTypeIdentifiers(t, referencedTypes);
    // track generic arity: look for Name<...> and count top-level commas
    const match = t.match(/([A-Za-z_][A-Za-z0-9_]*)<([^<>]*(?:<[^<>]*>[^<>]*)*)>/g);
    if (match) {
      for (const m of match) {
        const name = m.slice(0, m.indexOf('<'));
        const inner = m.slice(m.indexOf('<') + 1, m.lastIndexOf('>'));
        const arity = splitTopLevel(inner, ',').length;
        const prev = genericArity.get(name) ?? 0;
        if (arity > prev) genericArity.set(name, arity);
      }
    }
  }
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<' || c === '(' || c === '[') depth++;
    else if (c === '>' || c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.filter((x) => x.trim().length > 0);
}

for (const fns of methodsByTarget.values()) fns.forEach(visitFn);
freeFunctions.forEach(visitFn);
for (const h of handleTypes) (h.capabilities ?? []).forEach(visitFn);

// Also scan return types for generic arity.
function scanExprForGenerics(expr: string): void {
  const match = expr.match(/([A-Za-z_][A-Za-z0-9_]*)<([^<>]*(?:<[^<>]*>[^<>]*)*)>/g);
  if (!match) return;
  for (const m of match) {
    const name = m.slice(0, m.indexOf('<'));
    const inner = m.slice(m.indexOf('<') + 1, m.lastIndexOf('>'));
    const arity = splitTopLevel(inner, ',').length;
    const prev = genericArity.get(name) ?? 0;
    if (arity > prev) genericArity.set(name, arity);
  }
}

for (const fns of methodsByTarget.values()) {
  for (const fn of fns) scanExprForGenerics(cleanType(fn.returnType));
}
for (const fn of freeFunctions) scanExprForGenerics(cleanType(fn.returnType));

// ---------- emit ----------

const BUILT_IN = new Set([
  'string', 'number', 'boolean', 'any', 'unknown', 'void', 'never', 'null', 'undefined',
  'object', 'true', 'false', 'this', 'symbol', 'bigint',
  // JS globals we pass through
  'Promise', 'Array', 'Map', 'Set', 'Date', 'Error', 'RegExp', 'Record', 'Partial',
  'Readonly', 'Required', 'Pick', 'Omit', 'Exclude', 'Extract',
  // Our utility aliases / internal helpers declared at the top of the file
  'Dict', 'PropertyAccessor',
]);

const declaredTypes = new Set<string>([
  ...dtoTypes.map((d) => d.name),
  ...enumTypes.map((e) => e.name),
  ...handleTypes.map((h) => h.name),
  ...methodsByTarget.keys(),
]);

const parts: string[] = [];
parts.push(`// Auto-generated by scripts/generate-twoslash-types.ts — do not edit.`);
parts.push(`// This file is consumed by expressive-code-twoslash to provide hover tooltips`);
parts.push(`// for TypeScript code samples in the docs that import './.modules/aspire.js'.`);
parts.push(``);
parts.push(`declare global {`);
parts.push(`  type Dict<K extends string | number | symbol, V> = Record<K, V>;`);
parts.push(`}`);
parts.push(``);
parts.push(`// Shape used by the generated SDK for resource property accessors. Docs`);
parts.push(`// use several patterns on the same field:`);
parts.push(`//   \`await builder.environment.get()\`        — accessor form`);
parts.push(`//   \`await ctx.isRunMode()\`                    — callable form`);
parts.push(`//   \`builder.executionContext.isRunMode\`       — nested direct access`);
parts.push(`// Model as an intersection covering all three. For object T we include`);
parts.push(`// T directly so nested-property access resolves; for primitives we only`);
parts.push(`// need the callable + accessor surface (primitive intersections collapse).`);
parts.push(`export type PropertyAccessor<T> = (T extends object ? T : unknown) & (() => Promise<T>) & {`);
parts.push(`  get(): Promise<T>;`);
parts.push(`  set(value: T): Promise<void>;`);
parts.push(`  // Dict-valued accessors are sometimes set entry-wise in docs`);
parts.push(`  // (e.g. \`service.labels.set('key', 'value')\`).`);
parts.push(`  set(key: string, value: unknown): Promise<void>;`);
parts.push(`};`);
parts.push(``);
parts.push(`// ---- enums ----`);
for (const en of enumTypes) {
  parts.push(jsdoc([`Enum ${en.fullName}`]));
  const members = en.members.map((m) => JSON.stringify(m)).join(' | ') || 'string';
  parts.push(`export type ${en.name} = ${members};`);
  // Also emit a const object so docs samples can use `EnumName.Member` as a
  // runtime value (e.g. `withLifetime(ContainerLifetime.Persistent)`). The
  // upstream dump only gives us string-valued members, which matches how the
  // generated SDK surfaces .NET enums to TS.
  if (en.members.length > 0) {
    const fields = en.members
      .map((m) => `  readonly ${m}: ${JSON.stringify(m)};`)
      .join('\n');
    parts.push(`export declare const ${en.name}: {\n${fields}\n};`);
  }
  parts.push('');
}

parts.push(`// ---- DTOs ----`);
for (const dto of dtoTypes) {
  parts.push(jsdoc([`DTO ${dto.fullName}`]));
  parts.push(`export interface ${dto.name} {`);
  for (const f of dto.fields) {
    const t = cleanType(f.type);
    extractTypeIdentifiers(t, referencedTypes);
    scanExprForGenerics(t);
    parts.push(`  ${camelCase(f.name)}: ${t};`);
  }
  parts.push(`}`);
  parts.push('');
}

parts.push(`// ---- handle types ----`);
// Integration packages whose resources are NOT container-backed. Resources
// from these packages implement the same IComputeResource/IResourceWithArgs/
// IResourceWithEndpoints trio that container-backed resources do, but their
// .NET class does not derive from ContainerResource — so we must not inject
// it into the TS extends clause.
const NON_CONTAINER_PACKAGES = new Set([
  'Aspire.Hosting', // core primitives (ProjectResource, ExecutableResource, ...)
  'Aspire.Hosting.JavaScript',
  'Aspire.Hosting.Python',
  'Aspire.Hosting.DevTunnels',
  'Aspire.Hosting.Maui',
]);
// Specific handles to exclude even if their package is container-friendly.
// AzureFunctionsProjectResource is a project handle that lives in the Functions
// package alongside the Storage emulator (which IS container-backed).
const NON_CONTAINER_HANDLES = new Set([
  'AzureFunctionsProjectResource',
  'AzurePromptAgentResource',
]);

function isContainerBacked(h: HandleType): boolean {
  if (h.name === 'ContainerResource') return false;
  if (NON_CONTAINER_HANDLES.has(h.name)) return false;
  const pkg = handlePackage.get(h.name);
  if (pkg && NON_CONTAINER_PACKAGES.has(pkg)) return false;
  const ifaces = new Set(
    (h.implementedInterfaces ?? []).map((i) => lastDotted(i).split('<')[0])
  );
  return (
    ifaces.has('IComputeResource') &&
    ifaces.has('IResourceWithArgs') &&
    ifaces.has('IResourceWithEndpoints')
  );
}

for (const h of handleTypes) {
  const parents = (h.implementedInterfaces ?? [])
    .map((i) => cleanType(i))
    .map((i) => i.split('<')[0])
    .filter((i) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(i) && i !== h.name);
  const uniqueParents = [...new Set(parents)];
  if (isContainerBacked(h) && !uniqueParents.includes('ContainerResource')) {
    // Put ContainerResource first so chains like `.withImageTag(...).withLifetime(...)`
    // resolve to inherited members before the marker interfaces contribute noise.
    uniqueParents.unshift('ContainerResource');
  }
  // Chase the class-inheritance chain so methods defined on a parent class
  // (e.g. publishAsDockerFile on ExecutableResource) are visible on subclasses
  // (e.g. ViteAppResource). The ts-modules dump only lists implemented
  // interfaces, so without this step subclasses lose inherited members.
  let ancestor = classBaseByName.get(h.name);
  const seen = new Set<string>([h.name]);
  while (ancestor && !seen.has(ancestor)) {
    seen.add(ancestor);
    if (handleByName.has(ancestor) && !uniqueParents.includes(ancestor)) {
      uniqueParents.unshift(ancestor);
    }
    ancestor = classBaseByName.get(ancestor);
  }
  const implementsClause =
    uniqueParents.length > 0 ? ` extends ${uniqueParents.join(', ')}` : '';
  for (const i of uniqueParents) referencedTypes.add(i);
  parts.push(jsdoc([`Handle ${h.fullName}`]));
  parts.push(`export interface ${h.name}${implementsClause} {`);
  for (const cap of h.capabilities ?? []) {
    emitMember(cap, '  ', parts);
  }
  parts.push(`}`);
  parts.push('');
}

parts.push(`// ---- target-type interfaces (resource/builder APIs) ----`);
// Stable ordering: put IDistributedApplicationBuilder first for readability
const targetNames = [...methodsByTarget.keys()].sort((a, b) => {
  if (a === 'IDistributedApplicationBuilder') return -1;
  if (b === 'IDistributedApplicationBuilder') return 1;
  return a.localeCompare(b);
});

for (const target of targetNames) {
  // DTOs and enums collide (different TS shape), so skip those. For handle types
  // we use interface merging — emit an augmentation with the extension methods
  // that live in per-integration packages (e.g. addRedis from Aspire.Hosting.Redis).
  if (dtoByName.has(target) || enumByName.has(target)) continue;
  const fns = methodsByTarget.get(target)!;
  // Skip empty augmentations to keep output clean.
  if (fns.length === 0) continue;
  const isMerge = handleByName.has(target);
  // Dedupe against methods already declared on the handle to avoid duplicate
  // JSDoc and to keep the augmentation minimal.
  const existing = new Set<string>();
  if (isMerge) {
    for (const cap of handleByName.get(target)!.capabilities ?? []) {
      existing.add(`${lastDotted(cap.name)}:${cap.signature}`);
    }
  }
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const fn of fns) {
    const key = `${lastDotted(fn.name)}:${fn.signature}`;
    if (existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    emitMember(fn, '  ', lines);
  }
  if (lines.length === 0) continue;
  if (isMerge) parts.push(`// augments handle type ${target} with extension methods`);
  parts.push(`export interface ${target} {`);
  parts.push(...lines);
  parts.push(`}`);
  parts.push('');
  declaredTypes.add(target);
}

function emitMember(fn: FunctionEntry, indent: string, out: string[]): void {
  const desc = fn.description?.trim();
  const declaredRet = cleanType(fn.returnType);
  extractTypeIdentifiers(declaredRet, referencedTypes);
  scanExprForGenerics(declaredRet);
  // Some upstream entries arrive with a qualifier prefix (e.g. "Dict.clear" or
  // "RedisResource.port"); keep only the trailing identifier.
  const memberName = lastDotted(fn.name);
  // Properties dump as `PropertyGetter` with zero params. The generated SDK
  // surfaces them as async accessor objects — `{ get(): Promise<T>; set(v): Promise<void> }`
  // — so docs like `builder.environment.get()` typecheck.
  if (fn.kind === 'PropertyGetter' && fn.parameters.length === 0) {
    referencedTypes.add('PropertyAccessor');
    out.push(jsdoc([desc], indent));
    out.push(`${indent}${memberName}: PropertyAccessor<${declaredRet}>;`);
    return;
  }
  // Fluent chaining methods return a narrow mixin interface in the raw data,
  // which loses the concrete subtype when chaining (`.withX(...).withY(...)`
  // breaks because withX returns a generic `IResourceWith*`). Swap to
  // polymorphic `this` so the type flows through. Applies to any method
  // flagged `returnsBuilder` that isn't actually creating a new resource.
  const isFluentPrefix = /^(with|wait|on|publish)[A-Z0-9]/.test(memberName);
  const ret =
    fn.returnsBuilder && isFluentPrefix ? 'this' : declaredRet;
  const effectiveParams = applyParamOverrides(memberName, fn.parameters);
  // Record referenced types from overridden param types too, so the stubber sees them.
  for (const p of effectiveParams) extractTypeIdentifiers(paramType(p), referencedTypes);
  const split = optionsOverloadSplit(memberName, effectiveParams);
  if (split >= 0) {
    const leading = effectiveParams.slice(0, split);
    const tail = effectiveParams.slice(split);
    const leadingStr = formatParams(leading);
    const optsStr = formatOptionsObject(tail);
    const sep = leadingStr ? ', ' : '';
    // Options-object form first — matches how docs call these (`withX({ ... })`).
    out.push(jsdoc([desc], indent));
    out.push(`${indent}${memberName}(${leadingStr}${sep}${optsStr}): ${ret};`);
  }
  out.push(jsdoc([desc], indent));
  out.push(`${indent}${memberName}(${formatParams(effectiveParams)}): ${ret};`);
}

// ---- free functions ----
parts.push(`// ---- free functions ----`);
const seenFree = new Set<string>();
for (const fn of freeFunctions) {
  const key = `${fn.name}:${fn.signature}`;
  if (seenFree.has(key)) continue;
  seenFree.add(key);
  const desc = fn.description?.trim();
  const ret = cleanType(fn.returnType);
  extractTypeIdentifiers(ret, referencedTypes);
  const effectiveParams = applyParamOverrides(fn.name, fn.parameters);
  for (const p of effectiveParams) extractTypeIdentifiers(paramType(p), referencedTypes);
  const split = optionsOverloadSplit(fn.name, effectiveParams);
  if (split >= 0) {
    const leading = effectiveParams.slice(0, split);
    const tail = effectiveParams.slice(split);
    const leadingStr = formatParams(leading);
    const optsStr = formatOptionsObject(tail);
    const sep = leadingStr ? ', ' : '';
    parts.push(jsdoc([desc]));
    parts.push(`export declare function ${fn.name}(${leadingStr}${sep}${optsStr}): ${ret};`);
  }
  parts.push(jsdoc([desc]));
  parts.push(`export declare function ${fn.name}(${formatParams(effectiveParams)}): ${ret};`);
  parts.push('');
}

// ---- stubs for referenced-but-undeclared types ----
const missing: string[] = [];
for (const id of referencedTypes) {
  if (BUILT_IN.has(id)) continue;
  if (declaredTypes.has(id)) continue;
  missing.push(id);
}
missing.sort();

parts.push(`// ---- stubs for referenced SDK types not otherwise described ----`);
// Ensure IResource is declared so IResourceWith* stubs can extend it.
if (!declaredTypes.has('IResource') && !missing.includes('IResource')) {
  parts.push(`export interface IResource {}`);
}
for (const name of missing) {
  const arity = genericArity.get(name) ?? 0;
  // `IResourceWith*` marker interfaces in the SDK all inherit from `IResource`.
  // Without this, `waitFor(dep: IResource)` called from an `IResourceWithWaitSupport`
  // handle fails because TS sees two unrelated empty interfaces.
  const extendsClause =
    /^IResourceWith/.test(name) && name !== 'IResource' ? ' extends IResource' : '';
  if (arity > 0) {
    const generics = Array.from({ length: arity }, (_, i) => `T${i === 0 ? '' : i} = unknown`).join(', ');
    parts.push(`export interface ${name}<${generics}>${extendsClause} {}`);
  } else {
    parts.push(`export interface ${name}${extendsClause} {}`);
  }
}
parts.push('');

parts.push(`export {};`);

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_FILE, parts.join('\n'), 'utf8');
console.log(`✅ Wrote ${OUTPUT_FILE}`);
console.log(`   - ${dtoTypes.length} DTOs, ${enumTypes.length} enums, ${handleTypes.length} handle types`);
console.log(`   - ${methodsByTarget.size} target interfaces, ${freeFunctions.length} free functions`);
console.log(`   - ${missing.length} stub interfaces for referenced SDK types`);
