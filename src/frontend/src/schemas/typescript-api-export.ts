/* ------------------------------------------------------------------ */
/*  Canonical TypeScript API export, schema version 1.                 */
/*                                                                     */
/*  The TypeScript language exporter owns this schema and every final   */
/*  signature and declaration. `aspire sdk export --language           */
/*  typescript` passes the document through without reconstructing it   */
/*  from the underlying capability model.                              */
/* ------------------------------------------------------------------ */

import { readFileSync } from 'node:fs';

export const TYPESCRIPT_API_EXPORT_SCHEMA_VERSION = 1;

export const TYPESCRIPT_API_EXPORT_LANGUAGE = 'typescript';

export const TYPESCRIPT_API_EXPORT_V1_KINDS = [
  'interface',
  'enum',
  'dto',
  'options',
  'namespace',
  'constant',
  'augmentation',
  'method',
  'property',
] as const;

export type TypeScriptApiExportV1Kind = (typeof TYPESCRIPT_API_EXPORT_V1_KINDS)[number];

export interface TypeScriptApiPackageIdentity {
  name: string;
  version: string;
}

export interface TypeScriptApiGeneratorIdentity {
  name: string;
  version: string;
}

export interface TypeScriptApiParameter {
  name: string;
  type: string;
  optional: boolean;
  summary?: string;
}

export interface TypeScriptApiMember {
  id: string;
  kind: TypeScriptApiExportV1Kind;
  name: string;
  /** The final TypeScript text, for example `addRedis(name: string): RedisResourcePromise`. */
  declaration: string;
  capabilityId?: string;
  summary?: string;
  remarks?: string;
  deprecated?: string;
  returnType?: string;
  examples?: string[];
  parameters?: TypeScriptApiParameter[];
}

export interface TypeScriptApiItem {
  id: string;
  typeId: string;
  kind: TypeScriptApiExportV1Kind;
  name: string;
  /** The final TypeScript declaration header, for example `export interface RedisResource`. */
  declaration: string;
  owningAssembly: string;
  summary?: string;
  remarks?: string;
  examples?: string[];
  extends?: string[];
  members?: TypeScriptApiMember[];
}

export interface TypeScriptApiModule {
  name: string;
  summary?: string;
  items: TypeScriptApiItem[];
}

export interface TypeScriptApiDeclaration {
  id: string;
  content: string;
  owningAssembly: string;
}

export interface TypeScriptApiExport {
  schemaVersion: number;
  language: string;
  generator: TypeScriptApiGeneratorIdentity;
  package: TypeScriptApiPackageIdentity;
  modules: TypeScriptApiModule[];
  declarations: TypeScriptApiDeclaration[];
}

export class TypeScriptApiExportError extends Error {
  constructor(source: string, message: string) {
    super(`${source}: ${message}`);
    this.name = 'TypeScriptApiExportError';
  }
}

function fail(source: string, message: string): never {
  throw new TypeScriptApiExportError(source, message);
}

function requireRecord(source: string, value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(source, `${path} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireArray(source: string, value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(source, `${path} must be an array.`);
  }

  return value;
}

function requireNonEmptyString(source: string, value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(source, `${path} must be a non-empty string.`);
  }

  return value;
}

const TYPESCRIPT_API_EXPORT_V1_KIND_SET: ReadonlySet<string> = new Set(
  TYPESCRIPT_API_EXPORT_V1_KINDS,
);

function isTypeScriptApiExportV1Kind(value: string): value is TypeScriptApiExportV1Kind {
  return TYPESCRIPT_API_EXPORT_V1_KIND_SET.has(value);
}

function requireTypeScriptApiExportV1Kind(
  source: string,
  value: unknown,
  path: string,
): TypeScriptApiExportV1Kind {
  const kind = requireNonEmptyString(source, value, path);
  if (!isTypeScriptApiExportV1Kind(kind)) {
    fail(
      source,
      `${path} must be one of ${TYPESCRIPT_API_EXPORT_V1_KINDS.join(', ')}; received ${JSON.stringify(kind)}.`,
    );
  }

  return kind;
}

function requireBoolean(source: string, value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail(source, `${path} must be a boolean.`);
  }

  return value;
}

function optionalString(source: string, value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    fail(source, `${path} must be a string when present.`);
  }

  return value;
}

function optionalStringArray(source: string, value: unknown, path: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requireArray(source, value, path).map((entry, index) =>
    requireNonEmptyString(source, entry, `${path}[${index}]`),
  );
}

function parseParameter(source: string, value: unknown, path: string): TypeScriptApiParameter {
  const record = requireRecord(source, value, path);

  return {
    name: requireNonEmptyString(source, record.name, `${path}.name`),
    type: requireNonEmptyString(source, record.type, `${path}.type`),
    optional: requireBoolean(source, record.optional, `${path}.optional`),
    summary: optionalString(source, record.summary, `${path}.summary`),
  };
}

function parseMember(source: string, value: unknown, path: string): TypeScriptApiMember {
  const record = requireRecord(source, value, path);

  const parameters = record.parameters === undefined || record.parameters === null
    ? undefined
    : requireArray(source, record.parameters, `${path}.parameters`).map((parameter, index) =>
        parseParameter(source, parameter, `${path}.parameters[${index}]`),
      );

  return {
    id: requireNonEmptyString(source, record.id, `${path}.id`),
    kind: requireTypeScriptApiExportV1Kind(source, record.kind, `${path}.kind`),
    name: requireNonEmptyString(source, record.name, `${path}.name`),
    // A blank declaration means the producer failed to resolve a signature, which would otherwise
    // surface as an empty code block on a published page.
    declaration: requireNonEmptyString(source, record.declaration, `${path}.declaration`),
    capabilityId: optionalString(source, record.capabilityId, `${path}.capabilityId`),
    summary: optionalString(source, record.summary, `${path}.summary`),
    remarks: optionalString(source, record.remarks, `${path}.remarks`),
    deprecated: optionalString(source, record.deprecated, `${path}.deprecated`),
    returnType: optionalString(source, record.returnType, `${path}.returnType`),
    examples: optionalStringArray(source, record.examples, `${path}.examples`),
    parameters,
  };
}

function parseItem(source: string, value: unknown, path: string): TypeScriptApiItem {
  const record = requireRecord(source, value, path);

  const members = record.members === undefined || record.members === null
    ? undefined
    : requireArray(source, record.members, `${path}.members`).map((member, index) =>
        parseMember(source, member, `${path}.members[${index}]`),
      );

  return {
    id: requireNonEmptyString(source, record.id, `${path}.id`),
    typeId: requireNonEmptyString(source, record.typeId, `${path}.typeId`),
    kind: requireTypeScriptApiExportV1Kind(source, record.kind, `${path}.kind`),
    name: requireNonEmptyString(source, record.name, `${path}.name`),
    declaration: requireNonEmptyString(source, record.declaration, `${path}.declaration`),
    owningAssembly: requireNonEmptyString(source, record.owningAssembly, `${path}.owningAssembly`),
    summary: optionalString(source, record.summary, `${path}.summary`),
    remarks: optionalString(source, record.remarks, `${path}.remarks`),
    examples: optionalStringArray(source, record.examples, `${path}.examples`),
    extends: optionalStringArray(source, record.extends, `${path}.extends`),
    members,
  };
}

function parseModule(source: string, value: unknown, path: string): TypeScriptApiModule {
  const record = requireRecord(source, value, path);

  return {
    name: requireNonEmptyString(source, record.name, `${path}.name`),
    summary: optionalString(source, record.summary, `${path}.summary`),
    items: requireArray(source, record.items, `${path}.items`).map((item, index) =>
      parseItem(source, item, `${path}.items[${index}]`),
    ),
  };
}

function parseDeclaration(source: string, value: unknown, path: string): TypeScriptApiDeclaration {
  const record = requireRecord(source, value, path);

  return {
    id: requireNonEmptyString(source, record.id, `${path}.id`),
    content: requireNonEmptyString(source, record.content, `${path}.content`),
    owningAssembly: requireNonEmptyString(source, record.owningAssembly, `${path}.owningAssembly`),
  };
}

/**
 * Validates one canonical export document. `source` names the origin (a file path, or `stdout` when
 * reading a CLI invocation) so a failure points at the input rather than at the site.
 */
export function parseTypeScriptApiExport(value: unknown, source: string): TypeScriptApiExport {
  const record = requireRecord(source, value, 'document');

  if (record.schemaVersion !== TYPESCRIPT_API_EXPORT_SCHEMA_VERSION) {
    fail(
      source,
      `unsupported schema version ${JSON.stringify(record.schemaVersion)}; expected ${TYPESCRIPT_API_EXPORT_SCHEMA_VERSION}.`,
    );
  }

  if (record.language !== TYPESCRIPT_API_EXPORT_LANGUAGE) {
    fail(
      source,
      `unexpected language ${JSON.stringify(record.language)}; expected ${TYPESCRIPT_API_EXPORT_LANGUAGE}.`,
    );
  }

  const generatorRecord = requireRecord(source, record.generator, 'generator');
  const generator: TypeScriptApiGeneratorIdentity = {
    name: requireNonEmptyString(source, generatorRecord.name, 'generator.name'),
    version: requireNonEmptyString(source, generatorRecord.version, 'generator.version'),
  };

  const packageRecord = requireRecord(source, record.package, 'package');
  const identity: TypeScriptApiPackageIdentity = {
    name: requireNonEmptyString(source, packageRecord.name, 'package.name'),
    version: requireNonEmptyString(source, packageRecord.version, 'package.version'),
  };

  const modules = requireArray(source, record.modules, 'modules').map((module, index) =>
    parseModule(source, module, `modules[${index}]`),
  );

  const declarations = requireArray(source, record.declarations, 'declarations').map(
    (declaration, index) => parseDeclaration(source, declaration, `declarations[${index}]`),
  );

  const seenItemIds = new Set<string>();
  for (const module of modules) {
    for (const item of module.items) {
      if (seenItemIds.has(item.id)) {
        fail(source, `duplicate item ID '${item.id}'.`);
      }
      seenItemIds.add(item.id);

      const seenMemberIds = new Set<string>();
      for (const member of item.members ?? []) {
        if (seenMemberIds.has(member.id)) {
          fail(source, `duplicate member ID '${member.id}' on item '${item.id}'.`);
        }
        seenMemberIds.add(member.id);
      }
    }
  }

  const declarationsById = new Map<string, string>();
  for (const declaration of declarations) {
    const existing = declarationsById.get(declaration.id);

    // Identical repeats are how the reference closure contributes the same core fragment to several
    // packages, so only disagreeing content is a defect.
    if (existing !== undefined && existing !== declaration.content) {
      fail(source, `duplicate declaration ID '${declaration.id}' with conflicting content.`);
    }

    declarationsById.set(declaration.id, declaration.content);
  }

  return {
    schemaVersion: TYPESCRIPT_API_EXPORT_SCHEMA_VERSION,
    language: TYPESCRIPT_API_EXPORT_LANGUAGE,
    generator,
    package: identity,
    modules,
    declarations,
  };
}

/** Reads and validates one canonical export document from disk. */
export function loadTypeScriptApiExport(path: string): TypeScriptApiExport {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new TypeScriptApiExportError(path, `could not be read (${(error as Error).message}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new TypeScriptApiExportError(path, `is not valid JSON (${(error as Error).message}).`);
  }

  return parseTypeScriptApiExport(parsed, path);
}

export interface ConcatenatedDeclarations {
  declarations: TypeScriptApiDeclaration[];
  text: string;
}

/**
 * Deduplicates and orders the declaration fragments of one package export by stable ID, then joins
 * them. This is mechanical on purpose — the fragments are already final TypeScript, so anything
 * beyond sorting and deduplication would be the site reshaping the producer's contract.
 */
export function concatenateDeclarations(
  document: TypeScriptApiExport,
): ConcatenatedDeclarations {
  const byId = new Map<string, TypeScriptApiDeclaration>();

  for (const declaration of document.declarations) {
    byId.set(declaration.id, declaration);
  }

  const declarations = [...byId.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );

  return {
    declarations,
    text: `${declarations.map((declaration) => declaration.content).join('\n')}\n`,
  };
}
