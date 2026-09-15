import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

interface CatalogEntry {
  title: string;
  version: string;
}

interface PackageMetadata {
  name: string;
  version: string;
  sourceRepository?: string;
  sourceCommit?: string;
}

interface ApiAttribute {
  name: string;
  constructorArguments?: unknown[];
  arguments?: Record<string, unknown>;
  namedArguments?: Record<string, unknown>;
}

interface ApiParameter {
  name: string;
  type?: string;
  modifier?: string;
  attributes?: ApiAttribute[];
}

interface ApiMember {
  name: string;
  kind?: string;
  signature?: string;
  genericParameters?: unknown[];
  attributes?: ApiAttribute[];
  parameters?: ApiParameter[];
}

interface ApiType {
  name: string;
  fullName: string;
  kind: string;
  baseType?: string;
  attributes?: ApiAttribute[];
  members?: ApiMember[];
}

interface PackageJson {
  package: PackageMetadata;
  types?: ApiType[];
}

interface DtoField {
  name: string;
  type: string;
  isOptional?: boolean;
}

interface DtoType {
  name: string;
  fields?: DtoField[];
}

interface HandleType {
  name: string;
  fullName: string;
  implementedInterfaces?: string[];
  baseTypeHierarchy?: string[];
}

interface TsModuleJson {
  package: PackageMetadata;
  functions?: unknown[];
  dtoTypes?: DtoType[];
  handleTypes?: HandleType[];
}

export interface GeneratedFile<T> {
  fileName: string;
  data: T;
  baseline?: T;
}

export interface ValidationInput {
  catalog: CatalogEntry[];
  packages: GeneratedFile<PackageJson>[];
  modules: GeneratedFile<TsModuleJson>[];
  declarations: string;
}

export interface ValidationResult {
  errors: string[];
  checks: string[];
}

interface ParsedInterface {
  parents: string[];
  properties: Map<string, { optional: boolean; type: string }>;
}

interface AttributePayloadShape {
  constructorArgumentCount: number;
  namedArgumentNames: string[];
}

const relevantAttribute = /(?:^|\.)Aspire(?:Export(?:Ignore)?|Dto|Union)Attribute$/;

function identity(metadata: PackageMetadata): string {
  return `${metadata.name}@${metadata.version}`;
}

function expectedFileName(metadata: PackageMetadata): string {
  return `${metadata.name}.${metadata.version}.json`;
}

function shortTypeName(typeId: string): string {
  let normalized = typeId.trim();
  normalized = normalized.replace(
    /[A-Za-z_][A-Za-z0-9_]*(?:[./][A-Za-z_][A-Za-z0-9_]*)+/g,
    (value) => {
      const withoutAssembly = value.includes('/')
        ? value.slice(value.lastIndexOf('/') + 1)
        : value;
      const parts = withoutAssembly.split('.');
      return parts[parts.length - 1];
    }
  );
  normalized = normalized.replace(/\]\]+/g, '');
  const withoutAssembly = normalized.includes('/')
    ? normalized.slice(normalized.lastIndexOf('/') + 1)
    : normalized;
  const withoutGeneric = withoutAssembly.split('<')[0];
  const parts = withoutGeneric.split('.');
  return parts[parts.length - 1];
}

function camelCase(name: string): string {
  return name.length === 0 ? name : name[0].toLowerCase() + name.slice(1);
}

function normalizeTypeScriptType(typeName: string): string {
  return typeName
    .trim()
    .replace(/[A-Za-z_][A-Za-z0-9_]*(?:[./][A-Za-z_][A-Za-z0-9_]*)+/g, (value) => {
      const withoutAssembly = value.includes('/')
        ? value.slice(value.lastIndexOf('/') + 1)
        : value;
      const parts = withoutAssembly.split('.');
      return parts[parts.length - 1];
    })
    .replace(/\s+/g, '');
}

function normalizeClrType(typeName: string): string {
  const slashIndex = typeName.indexOf('/');
  return (slashIndex >= 0 ? typeName.slice(slashIndex + 1) : typeName)
    .replace(/\s+/g, '')
    .replace(/`\d+\[\[/g, '<')
    .replace(/\],\[/g, ',')
    .replace(/\]\]/g, '>');
}

function addUnique<T>(
  files: GeneratedFile<T>[],
  metadata: (data: T) => PackageMetadata,
  label: string,
  errors: string[]
): Map<string, GeneratedFile<T>> {
  const byIdentity = new Map<string, GeneratedFile<T>>();
  for (const file of files) {
    const packageMetadata = metadata(file.data);
    const key = identity(packageMetadata);
    if (byIdentity.has(key)) {
      errors.push(`${label} contains duplicate package identity ${key}.`);
      continue;
    }
    byIdentity.set(key, file);
    if (file.fileName !== expectedFileName(packageMetadata)) {
      errors.push(
        `${label} file ${file.fileName} does not match its package identity; expected ${expectedFileName(packageMetadata)}.`
      );
    }
  }
  return byIdentity;
}

function isPackageOutputExpected(name: string): boolean {
  return (
    !name.startsWith('Aspire.Hosting.CodeGeneration.') &&
    name !== 'Aspire.Hosting.Integration.Analyzers'
  );
}

function attributesForOwner(
  result: Map<string, AttributePayloadShape>,
  owner: string,
  attributes: ApiAttribute[] | undefined
): void {
  const indexes = new Map<string, number>();
  for (const attribute of attributes ?? []) {
    if (!relevantAttribute.test(attribute.name)) continue;
    const index = indexes.get(attribute.name) ?? 0;
    indexes.set(attribute.name, index + 1);
    result.set(`${owner}|${attribute.name}|${index}`, {
      constructorArgumentCount: attribute.constructorArguments?.length ?? 0,
      namedArgumentNames: [
        ...new Set([
          ...Object.keys(attribute.arguments ?? {}),
          ...Object.keys(attribute.namedArguments ?? {}),
        ]),
      ].sort(),
    });
  }
}

function memberOwnerKey(typeOwner: string, member: ApiMember): string {
  const genericArity = member.genericParameters?.length ?? 0;
  const parameterTypes = (member.parameters ?? [])
    .map((parameter) =>
      `${parameter.modifier ? `${parameter.modifier} ` : ''}${parameter.type ?? '?'}`
    )
    .join(',');
  return `${typeOwner}/member:${member.kind ?? 'member'}:${member.name}${genericArity > 0 ? `\`${genericArity}` : ''}(${parameterTypes})`;
}

function collectAttributePayloads(pkg: PackageJson): Map<string, AttributePayloadShape> {
  const result = new Map<string, AttributePayloadShape>();
  for (const type of pkg.types ?? []) {
    const typeOwner = `type:${type.fullName}`;
    attributesForOwner(result, typeOwner, type.attributes);
    for (const member of type.members ?? []) {
      const memberOwner = memberOwnerKey(typeOwner, member);
      attributesForOwner(result, memberOwner, member.attributes);
      for (const [index, parameter] of (member.parameters ?? []).entries()) {
        attributesForOwner(
          result,
          `${memberOwner}/parameter:${index}:${parameter.name}`,
          parameter.attributes
        );
      }
    }
  }
  return result;
}

function hasExportedApi(pkg: PackageJson): boolean {
  const visit = (attributes: ApiAttribute[] | undefined): boolean =>
    (attributes ?? []).some((attribute) => /(?:^|\.)AspireExportAttribute$/.test(attribute.name));

  return (pkg.types ?? []).some(
    (type) =>
      visit(type.attributes) ||
      (type.members ?? []).some(
        (member) =>
          visit(member.attributes) ||
          (member.parameters ?? []).some((parameter) => visit(parameter.attributes))
      )
  );
}

function splitTopLevel(value: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '<') depth++;
    if (value[index] === '>') depth--;
    if (value[index] === ',' && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}

function parseInterfaces(declarations: string): Map<string, ParsedInterface> {
  const header = /^export interface ([A-Za-z_][A-Za-z0-9_]*)/gm;
  const matches = [...declarations.matchAll(header)];
  const result = new Map<string, ParsedInterface>();

  for (const [index, match] of matches.entries()) {
    const lineStart = match.index ?? 0;
    const lineEnd = declarations.indexOf('\n', lineStart);
    const headerLine = declarations.slice(
      lineStart,
      lineEnd === -1 ? declarations.length : lineEnd
    );
    let cursor = match[0].length;
    if (headerLine[cursor] === '<') {
      let depth = 0;
      do {
        if (headerLine[cursor] === '<') depth++;
        if (headerLine[cursor] === '>') depth--;
        cursor++;
      } while (cursor < headerLine.length && depth > 0);
    }
    const remainder = headerLine.slice(cursor).trim();
    const extendsText = remainder.startsWith('extends ')
      ? remainder.slice('extends '.length, remainder.lastIndexOf('{')).trim()
      : '';
    const bodyStart = lineEnd === -1 ? declarations.length : lineEnd + 1;
    const bodyEnd = matches[index + 1]?.index ?? declarations.length;
    const previous = result.get(match[1]);
    const parents = new Set(previous?.parents ?? []);
    for (const parent of splitTopLevel(extendsText).map(shortTypeName)) {
      parents.add(parent);
    }
    const properties = new Map(previous?.properties ?? []);
    const body = declarations.slice(bodyStart, bodyEnd);
    for (const property of body.matchAll(
      /^\s{2}([A-Za-z_][A-Za-z0-9_]*)(\?)?:\s*(.+);$/gm
    )) {
      properties.set(property[1], {
        optional: property[2] === '?',
        type: property[3].trim(),
      });
    }

    result.set(match[1], {
      parents: [...parents],
      properties,
    });
  }
  return result;
}

function setDifference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function resolveBaseHierarchy(
  module: TsModuleJson,
  handle: HandleType,
  packageByIdentity: Map<string, GeneratedFile<PackageJson>>
): string[] {
  if ((handle.baseTypeHierarchy?.length ?? 0) > 0) {
    return handle.baseTypeHierarchy!;
  }

  const pkg = packageByIdentity.get(identity(module.package))?.data;
  const baseByFullName = new Map(
    (pkg?.types ?? [])
      .filter((type) => type.kind === 'class' && type.baseType)
      .map((type) => [type.fullName, type.baseType!] as const)
  );
  const hierarchy: string[] = [];
  const seen = new Set<string>([handle.fullName]);
  let ancestor = baseByFullName.get(handle.fullName);
  while (ancestor && !seen.has(ancestor)) {
    hierarchy.push(ancestor);
    seen.add(ancestor);
    ancestor = baseByFullName.get(ancestor);
  }
  return hierarchy;
}

export function validateGeneratedApiData(input: ValidationInput): ValidationResult {
  const errors: string[] = [];
  const catalogByName = new Map<string, CatalogEntry>();
  for (const entry of input.catalog) {
    if (catalogByName.has(entry.title)) {
      errors.push(`Integration catalog contains duplicate package ${entry.title}.`);
    } else {
      catalogByName.set(entry.title, entry);
    }
  }

  const packageByIdentity = addUnique(input.packages, (pkg) => pkg.package, 'pkgs', errors);
  const moduleByIdentity = addUnique(input.modules, (module) => module.package, 'ts-modules', errors);

  for (const entry of input.catalog) {
    if (!isPackageOutputExpected(entry.title)) continue;
    const key = `${entry.title}@${entry.version}`;
    if (!packageByIdentity.has(key)) {
      errors.push(`Missing C# API output for catalog package ${key}.`);
    }
  }

  for (const file of input.packages) {
    const metadata = file.data.package;
    const catalogEntry = catalogByName.get(metadata.name);
    if (!catalogEntry) {
      errors.push(`C# API output ${identity(metadata)} is not present in the integration catalog.`);
    } else if (catalogEntry.version !== metadata.version) {
      errors.push(
        `Stale C# API output ${identity(metadata)}; catalog version is ${catalogEntry.version}.`
      );
    }
    if (!metadata.sourceRepository) {
      errors.push(`C# API output ${identity(metadata)} is missing its source repository.`);
    }

    if (file.baseline && identity(file.baseline.package) === identity(metadata)) {
      const before = collectAttributePayloads(file.baseline);
      const after = collectAttributePayloads(file.data);
      for (const [attributeKey, payload] of before) {
        const generatedPayload = after.get(attributeKey);
        const lostConstructorArguments =
          !generatedPayload ||
          generatedPayload.constructorArgumentCount < payload.constructorArgumentCount;
        const lostNamedArguments =
          !generatedPayload ||
          payload.namedArgumentNames.some(
            (name) => !generatedPayload.namedArgumentNames.includes(name)
          );
        if (lostConstructorArguments || lostNamedArguments) {
          errors.push(
            `Attribute payload changed or disappeared for ${identity(metadata)} at ${attributeKey}.`
          );
        }
      }
    }
  }

  for (const file of input.modules) {
    const metadata = file.data.package;
    const catalogEntry = catalogByName.get(metadata.name);
    if (!catalogEntry) {
      errors.push(`TypeScript API output ${identity(metadata)} is not present in the integration catalog.`);
    } else if (catalogEntry.version !== metadata.version) {
      errors.push(
        `Stale TypeScript API output ${identity(metadata)}; catalog version is ${catalogEntry.version}.`
      );
    }
    if ((file.data.functions?.length ?? 0) === 0) {
      errors.push(`TypeScript API output ${identity(metadata)} contains no exported functions.`);
    }

    const matchingPackage = packageByIdentity.get(identity(metadata))?.data;
    if (!matchingPackage) {
      errors.push(`TypeScript API output ${identity(metadata)} has no exact C# API output.`);
      continue;
    }
    if (metadata.sourceRepository !== matchingPackage.package.sourceRepository) {
      errors.push(
        `Source repository mismatch for ${identity(metadata)}: C# has ${matchingPackage.package.sourceRepository ?? '(missing)'}, TypeScript has ${metadata.sourceRepository ?? '(missing)'}.`
      );
    }
    if (metadata.sourceCommit !== matchingPackage.package.sourceCommit) {
      errors.push(
        `Source commit mismatch for ${identity(metadata)}: C# has ${matchingPackage.package.sourceCommit ?? '(missing)'}, TypeScript has ${metadata.sourceCommit ?? '(missing)'}.`
      );
    }
  }

  for (const file of input.packages) {
    if (hasExportedApi(file.data) && !moduleByIdentity.has(identity(file.data.package))) {
      errors.push(`Missing TypeScript API output for exported package ${identity(file.data.package)}.`);
    }
  }

  const parsedInterfaces = parseInterfaces(input.declarations);
  const selectedDtos = new Map<string, DtoType>();
  const selectedHandles = new Map<string, { handle: HandleType; module: TsModuleJson }>();
  for (const file of [...input.modules].sort((left, right) =>
    left.fileName.localeCompare(right.fileName)
  )) {
    for (const dto of file.data.dtoTypes ?? []) {
      if (!selectedDtos.has(dto.name)) selectedDtos.set(dto.name, dto);
    }
    for (const handle of file.data.handleTypes ?? []) {
      if (!selectedHandles.has(handle.name)) {
        selectedHandles.set(handle.name, { handle, module: file.data });
      }
    }
  }

  for (const dto of selectedDtos.values()) {
    const declaration = parsedInterfaces.get(dto.name);
    if (!declaration) {
      errors.push(`Twoslash DTO ${dto.name} is missing its declaration.`);
      continue;
    }
    for (const field of dto.fields ?? []) {
      const propertyName = camelCase(field.name);
      const property = declaration.properties.get(propertyName);
      if (!field.isOptional) {
        errors.push(
          `TypeScript DTO ${dto.name}.${propertyName} is required, but the SDK emits every DTO field as optional.`
        );
      } else if (!property) {
        errors.push(`Twoslash DTO ${dto.name} is missing property ${propertyName}.`);
      } else if (!property.optional) {
        errors.push(
          `Twoslash DTO ${dto.name}.${propertyName} optionality does not match ts-modules metadata.`
        );
      }
      if (
        property &&
        normalizeTypeScriptType(property.type) !== normalizeTypeScriptType(field.type)
      ) {
        errors.push(
          `Twoslash DTO ${dto.name}.${propertyName} type ${property.type} does not match ts-modules metadata ${field.type}.`
        );
      }
    }
  }

  const knownHandles = new Set(selectedHandles.keys());
  for (const { handle, module } of selectedHandles.values()) {
    const declaration = parsedInterfaces.get(handle.name);
    if (!declaration) {
      errors.push(`Twoslash handle ${handle.name} is missing its declaration.`);
      continue;
    }
    const matchingPackage = packageByIdentity.get(identity(module.package))?.data;
    const packageType = (matchingPackage?.types ?? []).find(
      (type) => type.fullName === handle.fullName
    );
    const generatedDirectBase = handle.baseTypeHierarchy?.[0];
    if (packageType?.baseType) {
      if (!generatedDirectBase) {
        errors.push(
          `TypeScript handle ${handle.name} is missing base hierarchy metadata for C# base type ${packageType.baseType}.`
        );
      } else if (
        normalizeClrType(generatedDirectBase) !== normalizeClrType(packageType.baseType)
      ) {
        errors.push(
          `TypeScript handle ${handle.name} base type ${generatedDirectBase} does not match C# metadata ${packageType.baseType}.`
        );
      }
    }
    const expectedParents = new Set(
      (handle.implementedInterfaces ?? [])
        .map(shortTypeName)
        .filter(
          (name) =>
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
            name !== handle.name
        )
    );
    for (const ancestor of resolveBaseHierarchy(module, handle, packageByIdentity)) {
      const name = shortTypeName(ancestor);
      if (name !== handle.name && knownHandles.has(name)) expectedParents.add(name);
    }
    const actualParents = new Set(declaration.parents);
    const missing = setDifference(expectedParents, actualParents);
    const unexpected = setDifference(actualParents, expectedParents);
    if (missing.length > 0 || unexpected.length > 0) {
      errors.push(
        `Twoslash handle ${handle.name} has incorrect inheritance (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}).`
      );
    }
  }

  if (/options\?:\s*\{\s*options\?:/s.test(input.declarations)) {
    errors.push('Twoslash declarations contain a nested single-DTO options wrapper.');
  }

  return {
    errors,
    checks: [
      `${catalogByName.size} catalog package identities reconciled`,
      `${moduleByIdentity.size} TypeScript modules matched to C# provenance`,
      `${selectedDtos.size} DTO shapes checked`,
      `${selectedHandles.size} handle inheritance chains checked`,
      'attribute payload regressions checked against HEAD',
    ],
  };
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(frontendDir, '..', '..');
const dataDir = path.join(frontendDir, 'src', 'data');
const canonicalPackageDir = path.join(dataDir, 'pkgs');

export interface GitCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type GitCommandRunner = (arguments_: string[]) => GitCommandResult;

function runGit(arguments_: string[]): GitCommandResult {
  const result = spawnSync('git', arguments_, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function assertGitSucceeded(
  command: string,
  relativePath: string,
  result: GitCommandResult
): void {
  if (result.status === 0) return;

  const detail = result.error?.message ?? result.stderr.trim() ?? '';
  throw new Error(
    `Unable to read HEAD baseline for ${relativePath}: git ${command} failed${detail ? `: ${detail}` : '.'}`
  );
}

export function loadJsonFromHead<T>(
  root: string,
  relativePath: string,
  git: GitCommandRunner = runGit
): T | undefined {
  const treeArguments = ['-C', root, 'ls-tree', '--name-only', 'HEAD', '--', relativePath];
  const treeResult = git(treeArguments);
  assertGitSucceeded('ls-tree', relativePath, treeResult);
  if (treeResult.stdout.trim().length === 0) {
    return undefined;
  }

  const showResult = git(['-C', root, 'show', `HEAD:${relativePath}`]);
  assertGitSucceeded('show', relativePath, showResult);
  return JSON.parse(showResult.stdout) as T;
}

function loadJsonFiles<T>(directory: string, baselineDirectory?: string): GeneratedFile<T>[] {
  return fs
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => {
      const data = JSON.parse(fs.readFileSync(path.join(directory, fileName), 'utf8')) as T;
      let baseline: T | undefined;
      if (baselineDirectory) {
        const relativePath = path
          .relative(repoRoot, path.join(baselineDirectory, fileName))
          .replaceAll(path.sep, '/');
        baseline = loadJsonFromHead<T>(repoRoot, relativePath);
      }
      return { fileName, data, baseline };
    });
}

function main(): void {
  const packageDir = process.env.ASPIRE_API_PKGS_DIR
    ? path.resolve(process.env.ASPIRE_API_PKGS_DIR)
    : canonicalPackageDir;
  const moduleDir = process.env.ASPIRE_API_TS_MODULES_DIR
    ? path.resolve(process.env.ASPIRE_API_TS_MODULES_DIR)
    : path.join(dataDir, 'ts-modules');
  const declarationsFile = process.env.ASPIRE_API_TWOSLASH_FILE
    ? path.resolve(process.env.ASPIRE_API_TWOSLASH_FILE)
    : path.join(dataDir, 'twoslash', 'aspire.d.ts');
  const result = validateGeneratedApiData({
    catalog: JSON.parse(
      fs.readFileSync(path.join(dataDir, 'aspire-integrations.json'), 'utf8')
    ) as CatalogEntry[],
    packages: loadJsonFiles<PackageJson>(packageDir, canonicalPackageDir),
    modules: loadJsonFiles<TsModuleJson>(moduleDir),
    declarations: fs.readFileSync(declarationsFile, 'utf8'),
  });

  if (result.errors.length > 0) {
    console.error(`Generated API validation failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log('Generated API semantic validation passed:');
  for (const check of result.checks) console.log(`  - ${check}`);
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) main();
