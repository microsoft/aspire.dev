import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';

import {
  type AppHostLanguageId,
  getAppHostLanguages,
  getGeneratedApiLanguages,
} from './apphost-languages';

export type AppHostApiItemKind =
  | 'capability'
  | 'handle'
  | 'dto'
  | 'enum'
  | 'exportedValue';

export type AppHostProjectionValidation =
  | 'source-derived'
  | 'upstream-test-validated'
  | 'sdk-output-validated';

export interface AppHostApiParameter {
  name: string;
  type: string;
  isOptional?: boolean;
  isNullable?: boolean;
  defaultValue?: string;
  isCallback?: boolean;
  callbackSignature?: string;
  description?: string;
}

export interface AppHostApiField {
  name: string;
  type: string;
  isOptional?: boolean;
  isNullable?: boolean;
  description?: string;
}

export interface AppHostApiEnumMember {
  name: string;
  value?: string | number;
  description?: string;
}

export interface AppHostApiProjection {
  status: 'supported' | 'unsupported';
  validation: AppHostProjectionValidation;
  reason?: string;
  identifier?: string;
  signature?: string;
  declaration?: string;
  sourceFile?: string;
  kind?: 'interface' | 'class' | 'handle';
  parameters?: AppHostApiParameter[];
  return?: {
    type: string;
    errorModel?: 'exception' | 'result' | 'deferred' | 'none';
  };
  fields?: AppHostApiField[];
  members?: AppHostApiEnumMember[];
  implementedInterfaces?: string[];
  valueExpression?: string;
}

export interface AppHostApiItem {
  id: string;
  kind: AppHostApiItemKind;
  name: string;
  fullName?: string;
  capabilityId?: string;
  qualifiedName?: string;
  capabilityKind?: string;
  description?: string;
  remarks?: string;
  returns?: string;
  targetTypeId?: string;
  expandedTargetTypes?: string[];
  returnsBuilder?: boolean;
  parameters?: AppHostApiParameter[];
  returnType?: string;
  fields?: AppHostApiField[];
  members?: AppHostApiEnumMember[];
  pathSegments?: string[];
  value?: unknown;
  isInterface?: boolean;
  exposeProperties?: boolean;
  exposeMethods?: boolean;
  implementedInterfaces?: string[];
  baseTypeHierarchy?: string[];
  projections: Partial<Record<AppHostLanguageId, AppHostApiProjection>>;
}

export interface AppHostModulePackage {
  name: string;
  version?: string;
  sourceRepository?: string;
  sourceCommit?: string;
}

export interface AppHostModuleDocument {
  schemaVersion: string;
  generatorProvenance: {
    repository: string;
    commit: string;
    lockFile: string;
  };
  dumpProvenance?: {
    cliVersion?: string;
    productCommit?: string;
    generatedAt?: string;
  };
  package: AppHostModulePackage;
  items: AppHostApiItem[];
}

export interface AppHostCapabilityLanguageResolution {
  csharpMemberName: string;
  itemIds: string[];
  languages: Partial<Record<AppHostLanguageId, {
    status: AppHostApiProjection['status'];
    identifier?: string;
    validation: AppHostProjectionValidation;
    reason?: string;
  }>>;
}

export type AppHostPackageLanguageStatus =
  | 'supported'
  | 'limited'
  | 'unsupported'
  | 'missing';

export interface AppHostPackageLanguageResolution {
  packageName: string;
  packageVersion?: string;
  languages: Partial<Record<AppHostLanguageId, {
    status: AppHostPackageLanguageStatus;
    supportedItems: number;
    totalItems: number;
    reasons: string[];
  }>>;
}

export interface ProjectedFunction {
  id: string;
  name: string;
  kind?: string;
  qualifiedName?: string;
  capabilityId?: string;
  targetTypeId?: string;
  signature?: string;
  description?: string;
  remarks?: string;
  returns?: string;
  parameters?: AppHostApiParameter[];
  returnType?: string;
  returnsBuilder?: boolean;
  expandedTargetTypes?: string[];
  sourceFile?: string;
  errorModel?: 'exception' | 'result' | 'deferred' | 'none';
}

export interface ProjectedNamedItem {
  id: string;
  name: string;
  fullName?: string;
  kind?: string;
  description?: string;
  remarks?: string;
  declaration?: string;
  sourceFile?: string;
}

export interface ProjectedHandleType extends ProjectedNamedItem {
  kind?: 'handle';
  isInterface?: boolean;
  exposeProperties?: boolean;
  exposeMethods?: boolean;
  implementedInterfaces?: string[];
  baseTypeHierarchy?: string[];
  capabilities?: ProjectedFunction[];
}

export interface ProjectedDtoType extends ProjectedNamedItem {
  kind?: 'dto';
  fields?: AppHostApiField[];
}

export interface ProjectedEnumType extends ProjectedNamedItem {
  kind?: 'enum';
  members?: string[];
}

export interface ProjectedExportedValue extends ProjectedNamedItem {
  kind?: 'exportedValue';
  pathSegments?: string[];
  type?: string;
  valueExpression?: string;
}

export interface ProjectedAppHostModule {
  package: AppHostModulePackage & {
    language: AppHostLanguageId;
  };
  functions: ProjectedFunction[];
  handleTypes: ProjectedHandleType[];
  dtoTypes: ProjectedDtoType[];
  enumTypes: ProjectedEnumType[];
  exportedValues: ProjectedExportedValue[];
}

export type AppHostModuleCollectionEntry = Omit<CollectionEntry<'apphostModules'>, 'data'> & {
  data: AppHostModuleDocument;
};

let modulesPromise: Promise<AppHostModuleCollectionEntry[]> | undefined;
const shouldCacheModules = import.meta.env.PROD;

export function getAppHostModules(): Promise<AppHostModuleCollectionEntry[]> {
  if (!shouldCacheModules) {
    return getCollection('apphostModules');
  }

  modulesPromise ??= getCollection('apphostModules') as Promise<AppHostModuleCollectionEntry[]>;
  return modulesPromise;
}

export function getSupportedProjection(
  item: AppHostApiItem,
  language: AppHostLanguageId
): AppHostApiProjection | undefined {
  const projection = item.projections[language];
  return projection?.status === 'supported' ? projection : undefined;
}

export function getGeneratedProjectionLanguages(
  item: AppHostApiItem,
  languages: readonly AppHostLanguageId[] = getGeneratedApiLanguages().map((language) => language.id)
): AppHostLanguageId[] {
  return languages
    .filter((language) => getSupportedProjection(item, language));
}

export function projectAppHostModule(
  document: AppHostModuleDocument,
  language: AppHostLanguageId
): ProjectedAppHostModule {
  const capabilityItems = document.items.filter((item) => item.kind === 'capability');
  const functions = capabilityItems.flatMap((item) => {
    const projection = getSupportedProjection(item, language);
    if (!projection?.identifier) {
      return [];
    }

    return [{
      id: item.id,
      name: projection.identifier,
      kind: item.capabilityKind,
      qualifiedName: item.qualifiedName,
      capabilityId: item.capabilityId,
      targetTypeId: item.targetTypeId,
      signature: projection.signature ?? projection.declaration,
      description: item.description,
      remarks: item.remarks,
      returns: item.returns,
      parameters: projection.parameters ?? [],
      returnType: projection.return?.type ?? 'void',
      returnsBuilder: item.returnsBuilder,
      expandedTargetTypes: item.expandedTargetTypes ?? [],
      sourceFile: projection.sourceFile,
      errorModel: projection.return?.errorModel,
    }];
  });

  const capabilitiesByTarget = new Map<string, ProjectedFunction[]>();
  for (const fn of functions) {
    for (const target of [fn.targetTypeId, ...(fn.expandedTargetTypes ?? [])]) {
      if (!target) continue;
      const key = normalizeTypeIdentity(target);
      const entries = capabilitiesByTarget.get(key) ?? [];
      if (!entries.some((candidate) => candidate.id === fn.id)) {
        entries.push(fn);
      }
      capabilitiesByTarget.set(key, entries);
    }
  }

  const handleTypes = document.items.flatMap((item): ProjectedHandleType[] => {
    if (item.kind !== 'handle') return [];
    const projection = getSupportedProjection(item, language);
    if (!projection?.identifier) return [];
    const typeIdentity = normalizeTypeIdentity(item.fullName ?? item.id);
    return [{
      id: item.id,
      name: projection.identifier,
      fullName: item.fullName,
      kind: 'handle',
      isInterface: projection.kind === 'interface' || item.isInterface,
      exposeProperties: item.exposeProperties,
      exposeMethods: item.exposeMethods,
      description: item.description,
      remarks: item.remarks,
      declaration: projection.declaration,
      sourceFile: projection.sourceFile,
      implementedInterfaces: projection.implementedInterfaces ?? item.implementedInterfaces ?? [],
      baseTypeHierarchy: item.baseTypeHierarchy ?? [],
      capabilities: capabilitiesByTarget.get(typeIdentity) ?? [],
    }];
  });

  const dtoTypes = document.items.flatMap((item): ProjectedDtoType[] => {
    if (item.kind !== 'dto') return [];
    const projection = getSupportedProjection(item, language);
    if (!projection?.identifier) return [];
    return [{
      id: item.id,
      name: projection.identifier,
      fullName: item.fullName,
      kind: 'dto',
      description: item.description,
      remarks: item.remarks,
      declaration: projection.declaration,
      sourceFile: projection.sourceFile,
      fields: projection.fields ?? item.fields ?? [],
    }];
  });

  const enumTypes = document.items.flatMap((item): ProjectedEnumType[] => {
    if (item.kind !== 'enum') return [];
    const projection = getSupportedProjection(item, language);
    if (!projection?.identifier) return [];
    return [{
      id: item.id,
      name: projection.identifier,
      fullName: item.fullName,
      kind: 'enum',
      description: item.description,
      remarks: item.remarks,
      declaration: projection.declaration,
      sourceFile: projection.sourceFile,
      members: (projection.members ?? item.members ?? []).map((member) => member.name),
    }];
  });

  const exportedValues = document.items.flatMap((item): ProjectedExportedValue[] => {
    if (item.kind !== 'exportedValue') return [];
    const projection = getSupportedProjection(item, language);
    if (!projection?.identifier) return [];
    return [{
      id: item.id,
      name: projection.identifier,
      fullName: item.fullName,
      kind: 'exportedValue',
      description: item.description,
      remarks: item.remarks,
      declaration: projection.declaration,
      sourceFile: projection.sourceFile,
      pathSegments: item.pathSegments,
      type: projection.return?.type,
      valueExpression: projection.valueExpression,
    }];
  });

  return {
    package: { ...document.package, language },
    functions,
    handleTypes,
    dtoTypes,
    enumTypes,
    exportedValues,
  };
}

export function normalizeTypeIdentity(typeId: string): string {
  const slashIndex = typeId.indexOf('/');
  return slashIndex >= 0 ? typeId.slice(slashIndex + 1) : typeId;
}

export function getCapabilitiesForHandle(
  document: AppHostModuleDocument,
  handle: AppHostApiItem
): AppHostApiItem[] {
  const handleIdentity = normalizeTypeIdentity(handle.fullName ?? handle.id);
  return document.items.filter((item) => {
    if (item.kind !== 'capability') return false;
    return [item.targetTypeId, ...(item.expandedTargetTypes ?? [])]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeTypeIdentity(value) === handleIdentity);
  });
}

export function resolveAppHostCapabilityLanguageSupport(
  document: AppHostModuleDocument,
  csharpMemberName: string
): AppHostCapabilityLanguageResolution | undefined {
  const names = csharpCapabilityNameCandidates(csharpMemberName);
  const capabilities = document.items.filter((item) => item.kind === 'capability');
  let matches = capabilities.filter((item) => {
    const capabilityName = item.capabilityId?.split('/').at(-1);
    return [item.name, capabilityName]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase() === names.exact);
  });
  if (matches.length === 0 && names.withoutAsync !== names.exact) {
    matches = capabilities.filter((item) => {
      const capabilityName = item.capabilityId?.split('/').at(-1);
      return [item.name, capabilityName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase() === names.withoutAsync);
    });
  }
  if (matches.length === 0) return undefined;

  const languages: AppHostCapabilityLanguageResolution['languages'] = {};
  for (const language of getAppHostLanguages().filter((candidate) => candidate.generatedApi)) {
    const projections = matches
      .map((item) => item.projections[language.id])
      .filter((projection): projection is AppHostApiProjection => Boolean(projection));
    const projection =
      projections.find((candidate) => candidate.status === 'supported') ??
      projections[0];
    if (!projection) continue;
    languages[language.id] = {
      status: projection.status,
      identifier: projection.identifier,
      validation: projection.validation,
      reason: projection.reason,
    };
  }

  return {
    csharpMemberName,
    itemIds: matches.map((item) => item.id),
    languages,
  };
}

export function resolveAppHostPackageLanguageSupport(
  document: AppHostModuleDocument
): AppHostPackageLanguageResolution {
  const languages: AppHostPackageLanguageResolution['languages'] = {};
  for (const language of getAppHostLanguages().filter((candidate) => candidate.generatedApi)) {
    const projections = document.items
      .map((item) => item.projections[language.id])
      .filter((projection): projection is AppHostApiProjection => Boolean(projection));
    const supportedItems = projections.filter((projection) => projection.status === 'supported').length;
    const totalItems = document.items.length;
    const reasons = [...new Set(
      projections
        .map((projection) => projection.reason)
        .filter((reason): reason is string => Boolean(reason))
    )];
    const status: AppHostPackageLanguageStatus =
      projections.length < totalItems
        ? 'missing'
        : supportedItems === 0
          ? 'unsupported'
          : supportedItems < totalItems
            ? 'limited'
            : 'supported';
    languages[language.id] = { status, supportedItems, totalItems, reasons };
  }

  return {
    packageName: document.package.name,
    packageVersion: document.package.version,
    languages,
  };
}

export async function getAppHostPackageLanguageSupport(
  packageName: string
): Promise<AppHostPackageLanguageResolution | undefined> {
  const module = (await getAppHostModules())
    .find((entry) => entry.data.package.name === packageName);
  return module ? resolveAppHostPackageLanguageSupport(module.data) : undefined;
}

export async function getAppHostCapabilityLanguageSupport(
  packageName: string,
  csharpMemberName: string
): Promise<AppHostCapabilityLanguageResolution | undefined> {
  const module = (await getAppHostModules())
    .find((entry) => entry.data.package.name === packageName);
  return module
    ? resolveAppHostCapabilityLanguageSupport(module.data, csharpMemberName)
    : undefined;
}

function csharpCapabilityNameCandidates(name: string): {
  exact: string;
  withoutAsync: string;
} {
  const normalized = name.trim();
  const lowerCamel = normalized.length > 0
    ? normalized[0].toLowerCase() + normalized.slice(1)
    : normalized;
  const withoutAsync = lowerCamel.endsWith('Async')
    ? lowerCamel.slice(0, -'Async'.length)
    : lowerCamel;
  return {
    exact: lowerCamel.toLowerCase(),
    withoutAsync: withoutAsync.toLowerCase(),
  };
}

export function appHostModuleSlug(name: string): string {
  return name.toLowerCase();
}

export function appHostSlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
