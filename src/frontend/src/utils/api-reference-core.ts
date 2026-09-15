import { memberNameSlug } from './api-member-anchors';
import {
  getTsItemSlug,
  getTsMemberAnchor,
  getTsMethodSlug,
  getTsTopLevelRouteItems,
} from './ts-api-routes';

export interface ApiReferenceAttribute {
  name: string;
  constructorArguments?: unknown[];
  arguments?: Record<string, unknown>;
  namedArguments?: Record<string, unknown>;
}

export interface ApiReferenceParameter {
  name?: string;
  type: string;
  modifier?: string;
}

export interface ApiReferenceMember {
  name: string;
  kind?: string;
  signature?: string;
  genericParameters?: { name: string; constraints?: string[] }[];
  parameters?: ApiReferenceParameter[];
  attributes?: ApiReferenceAttribute[];
  isStatic?: boolean;
  isExtension?: boolean;
}

export interface ApiReferenceType {
  name: string;
  fullName?: string;
  namespace?: string;
  genericParameters?: { name: string; constraints?: string[] }[];
  attributes?: ApiReferenceAttribute[];
  members?: ApiReferenceMember[];
}

export interface ApiReferencePackageDocument {
  package: {
    name: string;
  };
  types?: ApiReferenceType[];
}

export interface ApiReferenceTsCallable {
  name: string;
  kind?: string;
  capabilityId?: string;
  qualifiedName?: string;
  signature?: string;
  targetTypeId?: string;
  expandedTargetTypes?: string[];
  parameters?: { name?: string; type?: string }[];
}

export interface ApiReferenceTsHandle {
  name: string;
  fullName?: string;
  capabilities?: ApiReferenceTsCallable[];
}

export interface ApiReferenceTsDocument {
  package: {
    name: string;
  };
  functions?: ApiReferenceTsCallable[];
  handleTypes?: ApiReferenceTsHandle[];
  dtoTypes?: { name: string; fullName?: string }[];
  enumTypes?: { name: string; fullName?: string }[];
}

export interface ApiReferenceTarget {
  label: string;
  path?: string;
}

export type ApiReferenceDiagnosticCode =
  | 'invalid-fqn'
  | 'missing-csharp'
  | 'ambiguous-csharp'
  | 'missing-typescript'
  | 'unresolved-typescript-export'
  | 'ambiguous-typescript';

export interface ApiReferenceDiagnostic {
  code: ApiReferenceDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  candidates: string[];
}

export interface ApiReferenceResolution {
  name: string;
  status: 'resolved' | 'missing' | 'ambiguous';
  csharp: ApiReferenceTarget;
  typescript: ApiReferenceTarget;
  diagnostics: ApiReferenceDiagnostic[];
}

export interface ApiReferenceIndex {
  readonly size: number;
  resolve(name: string, packageName?: string): ApiReferenceResolution;
}

interface CSharpCandidate {
  fqn: string;
  packageName: string;
  type: ApiReferenceType;
  members: ApiReferenceMember[];
}

interface TsRouteCandidate {
  moduleName: string;
  name: string;
  kind?: string;
  capabilityId?: string;
  qualifiedName?: string;
  targetTypeId?: string;
  expandedTargetTypes: string[];
  parentTypeFullName?: string;
  path: string;
  priority: number;
}

interface TsRouteIndex {
  byCapabilityId: Map<string, TsRouteCandidate[]>;
  byModuleAndName: Map<string, TsRouteCandidate[]>;
  byName: Map<string, TsRouteCandidate[]>;
}

interface ExportMapping {
  capabilityId?: string;
  methodName: string;
  member: ApiReferenceMember;
  required: boolean;
  allowUntargeted: boolean;
}

export const API_REFERENCE_FQN_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

const ASPIRE_EXPORT_ATTRIBUTE = /(?:^|\.)AspireExportAttribute$/;
const ASPIRE_EXPORT_IGNORE_ATTRIBUTE = /(?:^|\.)AspireExportIgnoreAttribute$/;
const CALLABLE_KINDS = new Set(['method', 'constructor', 'Method', 'InstanceMethod']);
const MEMBER_KIND_SLUGS: Record<string, string> = {
  constructor: 'constructors',
  property: 'properties',
  method: 'methods',
  field: 'fields',
  event: 'events',
  indexer: 'indexers',
};

function addToIndex<T>(index: Map<string, T[]>, key: string | undefined, value: T): void {
  if (!key) return;
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
}

function genericArity(type: ApiReferenceType): number {
  return type.genericParameters?.length ?? 0;
}

function csharpTypePath(packageName: string, typeName: string, arity: number): string {
  const typeSlug = `${typeName.toLowerCase()}${arity > 0 ? `-${arity}` : ''}`;
  return `/reference/api/csharp/${packageName.toLowerCase()}/${typeSlug}/`;
}

function tsModuleSlug(name: string): string {
  return name.toLowerCase();
}

function normalizeTypeName(value: string): string {
  const withoutAssembly = value.includes('/') ? value.slice(value.indexOf('/') + 1) : value;
  return withoutAssembly
    .trim()
    .replace(/\?$/, '')
    .replace(/^global::/, '')
    .replace(/`\d+/g, '')
    .replace(/<.*>$/, '')
    .replace(/\[\[.*\]\]$/, '');
}

function genericArguments(value: string): string[] {
  const start = value.indexOf('<');
  if (start < 0) return [];

  const argumentsList: string[] = [];
  let depth = 0;
  let current = '';

  for (let index = start + 1; index < value.length; index++) {
    const character = value[index];
    if (character === '<') {
      depth++;
      current += character;
    } else if (character === '>') {
      if (depth === 0) {
        if (current.trim()) argumentsList.push(current.trim());
        break;
      }
      depth--;
      current += character;
    } else if (character === ',' && depth === 0) {
      argumentsList.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }

  return argumentsList;
}

function simpleTypeName(value: string): string {
  const normalized = normalizeTypeName(value);
  return normalized.slice(normalized.lastIndexOf('.') + 1);
}

function lowerCamelCase(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function isCallable(kind: string | undefined): boolean {
  return kind ? CALLABLE_KINDS.has(kind) : false;
}

function callableLabel(name: string, kind: string | undefined): string {
  return name + (isCallable(kind) ? '()' : '');
}

function readNamedString(attribute: ApiReferenceAttribute, name: string): string | undefined {
  const value = attribute.arguments?.[name] ?? attribute.namedArguments?.[name];
  return typeof value === 'string' && value ? value : undefined;
}

function readNamedBoolean(attribute: ApiReferenceAttribute, name: string): boolean {
  const value = attribute.arguments?.[name] ?? attribute.namedArguments?.[name];
  return value === true || (typeof value === 'string' && value.toLowerCase() === 'true');
}

function extensionMappingIdentity(member: ApiReferenceMember): string {
  if (!member.isExtension) return '';
  const receiver =
    member.parameters?.find((parameter) => parameter.modifier === 'this')?.type ?? '';
  const constraints = (member.genericParameters ?? [])
    .flatMap((parameter) => parameter.constraints ?? [])
    .join(',');
  return `${receiver}\0${constraints}`;
}

function getExportMappings(candidate: CSharpCandidate): ExportMapping[] {
  const mappings = new Map<string, ExportMapping>();
  const typeExport = (candidate.type.attributes ?? []).find((attribute) =>
    ASPIRE_EXPORT_ATTRIBUTE.test(attribute.name)
  );
  const exposeMethods = typeExport ? readNamedBoolean(typeExport, 'ExposeMethods') : false;
  const exposeProperties = typeExport ? readNamedBoolean(typeExport, 'ExposeProperties') : false;

  for (const member of candidate.members) {
    const attributes = (member.attributes ?? []).filter((attribute) =>
      ASPIRE_EXPORT_ATTRIBUTE.test(attribute.name)
    );

    if (attributes.length > 0) {
      for (const attribute of attributes) {
        const explicitId = attribute.constructorArguments?.[0];
        const capabilityId =
          typeof explicitId === 'string' && explicitId
            ? `${candidate.packageName}/${explicitId}`
            : member.isStatic || member.isExtension
              ? `${candidate.packageName}/${lowerCamelCase(member.name)}`
              : undefined;
        const methodName = readNamedString(attribute, 'MethodName') ?? lowerCamelCase(member.name);
        const key = `${capabilityId ?? ''}\0${methodName}\0${extensionMappingIdentity(member)}`;
        mappings.set(key, {
          capabilityId,
          methodName,
          member,
          required: true,
          allowUntargeted: false,
        });
      }
      continue;
    }

    const ignoredAttributes = (member.attributes ?? []).filter((attribute) =>
      ASPIRE_EXPORT_IGNORE_ATTRIBUTE.test(attribute.name)
    );
    if (ignoredAttributes.length > 0) {
      const methodName = lowerCamelCase(member.name);
      const allowUntargeted = ignoredAttributes.some((attribute) =>
        /\bdispatcher\b|\b(?:canonical|generic)\b[^.]*\bexport\b/i.test(
          readNamedString(attribute, 'Reason') ?? ''
        )
      );
      const key = `optional\0${methodName}\0${allowUntargeted}\0${extensionMappingIdentity(member)}`;
      mappings.set(key, {
        methodName,
        member,
        required: false,
        allowUntargeted,
      });
      continue;
    }

    const exposedByType =
      (member.kind === 'method' && exposeMethods) ||
      (member.kind === 'property' && exposeProperties);
    if (exposedByType) {
      const methodName = lowerCamelCase(member.name);
      const key = `type\0${methodName}\0${extensionMappingIdentity(member)}`;
      mappings.set(key, {
        methodName,
        member,
        required: false,
        allowUntargeted: false,
      });
    }
  }

  return [...mappings.values()];
}

function buildTsRouteIndex(modules: readonly ApiReferenceTsDocument[]): TsRouteIndex {
  const byCapabilityId = new Map<string, TsRouteCandidate[]>();
  const byModuleAndName = new Map<string, TsRouteCandidate[]>();
  const byName = new Map<string, TsRouteCandidate[]>();

  const register = (candidate: TsRouteCandidate) => {
    addToIndex(byCapabilityId, candidate.capabilityId, candidate);
    addToIndex(byName, candidate.name.toLowerCase(), candidate);
    addToIndex(
      byModuleAndName,
      `${candidate.moduleName}\0${candidate.name.toLowerCase()}`,
      candidate
    );
  };

  for (const module of modules) {
    const moduleName = module.package.name;
    const modulePath = `/reference/api/typescript/${tsModuleSlug(moduleName)}`;
    const topLevelItems = getTsTopLevelRouteItems(module);

    const standaloneFunctions = (module.functions ?? []).filter(
      (fn) => !fn.qualifiedName || !fn.qualifiedName.includes('.')
    );
    for (const fn of standaloneFunctions) {
      register({
        moduleName,
        name: fn.name,
        kind: fn.kind,
        capabilityId: fn.capabilityId,
        qualifiedName: fn.qualifiedName,
        targetTypeId: fn.targetTypeId,
        expandedTargetTypes: fn.expandedTargetTypes ?? [],
        path: `${modulePath}/${getTsItemSlug(fn, topLevelItems)}/`,
        priority: 0,
      });
    }

    for (const handle of module.handleTypes ?? []) {
      const itemSlug = getTsItemSlug(handle, topLevelItems);
      const methods = (handle.capabilities ?? []).filter(
        (capability) => capability.kind === 'Method' || capability.kind === 'InstanceMethod'
      );

      for (const capability of handle.capabilities ?? []) {
        let path: string | undefined;
        let priority = 1;

        if (capability.kind === 'Method' || capability.kind === 'InstanceMethod') {
          path = `${modulePath}/${itemSlug}/${getTsMethodSlug(capability, methods, handle.name)}/`;
        } else if (capability.kind === 'PropertyGetter' || capability.kind === 'PropertySetter') {
          path = `${modulePath}/${itemSlug}/#${getTsMemberAnchor(capability.name)}`;
          priority = capability.kind === 'PropertyGetter' ? 1 : 2;
        }

        if (!path) continue;

        register({
          moduleName,
          name: capability.name,
          kind: capability.kind,
          capabilityId: capability.capabilityId,
          qualifiedName: capability.qualifiedName,
          targetTypeId: capability.targetTypeId,
          expandedTargetTypes: capability.expandedTargetTypes ?? [],
          parentTypeFullName: handle.fullName,
          path,
          priority,
        });
      }
    }
  }

  return { byCapabilityId, byModuleAndName, byName };
}

function extensionReceiverTypes(candidate: CSharpCandidate, member: ApiReferenceMember): string[] {
  if (!member.isExtension) return [];
  const receiver = member.parameters?.find((parameter) => parameter.modifier === 'this');
  if (!receiver) return [];

  const genericParameters = [
    ...(candidate.type.genericParameters ?? []),
    ...(member.genericParameters ?? []),
  ];
  const receiverTypes = [receiver.type, ...genericArguments(receiver.type)];
  const resolved = new Set<string>();

  for (const receiverType of receiverTypes) {
    const normalized = normalizeTypeName(receiverType);
    const genericParameter = genericParameters.find((parameter) => parameter.name === normalized);
    if (genericParameter?.constraints?.length) {
      for (const constraint of genericParameter.constraints) {
        resolved.add(normalizeTypeName(constraint));
      }
    } else {
      resolved.add(normalized);
    }
  }

  return [...resolved];
}

function candidateMatchesMember(
  route: TsRouteCandidate,
  candidate: CSharpCandidate,
  member: ApiReferenceMember
): boolean {
  const declaringFullName = normalizeTypeName(
    candidate.type.fullName ??
      `${candidate.type.namespace ? `${candidate.type.namespace}.` : ''}${candidate.type.name}`
  );
  const expectedTypes = member.isExtension
    ? extensionReceiverTypes(candidate, member)
    : [declaringFullName];
  if (expectedTypes.length === 0) expectedTypes.push(declaringFullName);
  const normalizedExpectedTypes = expectedTypes.map(normalizeTypeName);
  const expectedSimpleNames = normalizedExpectedTypes.map(simpleTypeName);
  const targetTypes = [
    route.parentTypeFullName,
    route.targetTypeId,
    ...route.expandedTargetTypes,
  ].filter((value): value is string => Boolean(value));

  if (
    targetTypes.some((targetType) =>
      normalizedExpectedTypes.includes(normalizeTypeName(targetType))
    )
  ) {
    return true;
  }

  const qualifiedName = route.qualifiedName;
  const lastDot = qualifiedName?.lastIndexOf('.') ?? -1;
  return (
    lastDot > 0 && expectedSimpleNames.includes(simpleTypeName(qualifiedName!.slice(0, lastDot)))
  );
}

function deduplicateTsCandidates(candidates: readonly TsRouteCandidate[]): TsRouteCandidate[] {
  const unique = new Map<string, TsRouteCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.path}\0${candidate.name}\0${candidate.kind ?? ''}`;
    const current = unique.get(key);
    if (!current || candidate.priority < current.priority) {
      unique.set(key, candidate);
    }
  }
  return [...unique.values()];
}

function preferredTsCandidates(candidates: readonly TsRouteCandidate[]): TsRouteCandidate[] {
  const unique = deduplicateTsCandidates(candidates);
  if (unique.length <= 1) return unique;
  const priority = Math.min(...unique.map((candidate) => candidate.priority));
  return unique.filter((candidate) => candidate.priority === priority);
}

function describeTsCandidate(candidate: TsRouteCandidate): string {
  return `${candidate.moduleName}:${candidate.qualifiedName ?? candidate.name} (${candidate.path})`;
}

function findTsCandidates(
  mapping: ExportMapping,
  candidate: CSharpCandidate,
  tsIndex: TsRouteIndex
): { matches: TsRouteCandidate[]; suggestions: TsRouteCandidate[] } {
  if (mapping.capabilityId) {
    const exact = tsIndex.byCapabilityId.get(mapping.capabilityId) ?? [];
    if (exact.length > 0) {
      return { matches: preferredTsCandidates(exact), suggestions: exact };
    }
  }

  const named =
    tsIndex.byModuleAndName.get(`${candidate.packageName}\0${mapping.methodName.toLowerCase()}`) ??
    [];
  const targeted = named.filter((route) =>
    candidateMatchesMember(route, candidate, mapping.member)
  );

  if (targeted.length > 0) {
    return { matches: preferredTsCandidates(targeted), suggestions: named };
  }

  if (mapping.allowUntargeted) {
    const globalNamed = tsIndex.byName.get(mapping.methodName.toLowerCase()) ?? [];
    const globalTargeted = globalNamed.filter((route) =>
      candidateMatchesMember(route, candidate, mapping.member)
    );
    if (globalTargeted.length > 0) {
      return {
        matches: preferredTsCandidates(globalTargeted),
        suggestions: globalNamed,
      };
    }
    return { matches: preferredTsCandidates(named), suggestions: named };
  }

  return { matches: [], suggestions: named };
}

function createCSharpTarget(candidate: CSharpCandidate): ApiReferenceTarget {
  const member = candidate.members[0];
  const kind = member.kind ?? 'method';
  return {
    label: callableLabel(member.name, kind),
    path: `${csharpTypePath(
      candidate.packageName,
      candidate.type.name,
      genericArity(candidate.type)
    )}${MEMBER_KIND_SLUGS[kind] ?? `${kind}s`}/#${memberNameSlug(member)}`,
  };
}

function resolveTypescriptTarget(
  candidate: CSharpCandidate,
  csharp: ApiReferenceTarget,
  tsIndex: TsRouteIndex
): { target: ApiReferenceTarget; diagnostics: ApiReferenceDiagnostic[] } {
  const mappings = getExportMappings(candidate);
  if (mappings.length === 0) {
    return {
      target: { label: csharp.label },
      diagnostics: [
        {
          code: 'missing-typescript',
          severity: 'warning',
          message: `ApiReference: "${candidate.fqn}" has no TypeScript export; the C# API name is shown without a TypeScript link.`,
          candidates: [],
        },
      ],
    };
  }

  const matches: TsRouteCandidate[] = [];
  const suggestions: TsRouteCandidate[] = [];
  let unresolved = false;

  for (const mapping of mappings) {
    const result = findTsCandidates(mapping, candidate, tsIndex);
    suggestions.push(...result.suggestions);
    if (result.matches.length === 0) {
      unresolved ||= mapping.required;
      continue;
    }
    matches.push(...result.matches);
  }

  const canonicalName = lowerCamelCase(candidate.members[0].name).toLowerCase();
  const canonicalMatches = matches.filter((match) => match.name.toLowerCase() === canonicalName);
  const preferred = preferredTsCandidates(canonicalMatches.length > 0 ? canonicalMatches : matches);
  const candidateDescriptions = deduplicateTsCandidates(
    suggestions.length > 0 ? suggestions : matches
  )
    .map(describeTsCandidate)
    .sort();

  if (unresolved) {
    return {
      target: { label: csharp.label },
      diagnostics: [
        {
          code: 'unresolved-typescript-export',
          severity: 'error',
          message: `ApiReference: "${candidate.fqn}" declares a TypeScript export, but no generated TypeScript API matched it.`,
          candidates: candidateDescriptions,
        },
      ],
    };
  }

  if (preferred.length === 0) {
    return {
      target: { label: csharp.label },
      diagnostics: [
        {
          code: 'missing-typescript',
          severity: 'warning',
          message: `ApiReference: "${candidate.fqn}" has no TypeScript export; the C# API name is shown without a TypeScript link.`,
          candidates: candidateDescriptions,
        },
      ],
    };
  }

  if (preferred.length > 1) {
    return {
      target: { label: csharp.label },
      diagnostics: [
        {
          code: 'ambiguous-typescript',
          severity: 'error',
          message: `ApiReference: "${candidate.fqn}" maps to multiple generated TypeScript APIs.`,
          candidates: preferred.map(describeTsCandidate).sort(),
        },
      ],
    };
  }

  const match = preferred[0];
  return {
    target: {
      label: callableLabel(match.name, match.kind),
      path: match.path,
    },
    diagnostics: [],
  };
}

function describeCSharpCandidate(candidate: CSharpCandidate): string {
  const signatures = candidate.members
    .map((member) => member.signature)
    .filter((signature): signature is string => Boolean(signature));
  return signatures.length > 0
    ? `${candidate.packageName}: ${signatures.join(' | ')}`
    : `${candidate.packageName}: ${candidate.fqn}`;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    for (let index = 0; index < current.length; index++) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function buildSuggestions(
  name: string,
  fqnsByMemberName: ReadonlyMap<string, readonly string[]>
): string[] {
  const memberName = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const exact = fqnsByMemberName.get(memberName);
  if (exact?.length) return [...exact].slice(0, 8);

  return [...fqnsByMemberName.entries()]
    .map(([candidateName, fqns]) => ({
      distance: editDistance(memberName, candidateName),
      fqns,
    }))
    .sort((left, right) => left.distance - right.distance)
    .filter(({ distance }) => distance <= Math.max(2, Math.floor(memberName.length / 3)))
    .flatMap(({ fqns }) => fqns)
    .slice(0, 8);
}

function fallbackTarget(name: string): ApiReferenceTarget {
  const label = name.slice(name.lastIndexOf('.') + 1) || name || 'Unknown API';
  return { label };
}

export function buildApiReferenceIndex(
  packages: readonly ApiReferencePackageDocument[],
  modules: readonly ApiReferenceTsDocument[]
): ApiReferenceIndex {
  const candidates = new Map<string, Map<string, CSharpCandidate>>();
  const fqnsByMemberName = new Map<string, string[]>();
  const tsIndex = buildTsRouteIndex(modules);

  for (const pkg of packages) {
    for (const type of pkg.types ?? []) {
      const typeFullName = normalizeTypeName(
        type.fullName ?? `${type.namespace ? `${type.namespace}.` : ''}${type.name}`
      );

      for (const member of type.members ?? []) {
        const fqn = `${typeFullName}.${member.name}`;
        const groupKey = `${pkg.package.name}\0${type.fullName ?? typeFullName}`;
        const groups = candidates.get(fqn) ?? new Map<string, CSharpCandidate>();
        const group = groups.get(groupKey) ?? {
          fqn,
          packageName: pkg.package.name,
          type,
          members: [],
        };
        group.members.push(member);
        groups.set(groupKey, group);
        candidates.set(fqn, groups);

        const memberName = member.name.toLowerCase();
        const memberFqns = fqnsByMemberName.get(memberName) ?? [];
        if (!memberFqns.includes(fqn)) memberFqns.push(fqn);
        fqnsByMemberName.set(memberName, memberFqns);
      }
    }
  }

  const resolutions = new Map<string, ApiReferenceResolution>();
  const packageResolutions = new Map<string, ApiReferenceResolution>();

  for (const [fqn, groups] of candidates) {
    const matches = [...groups.values()];
    const matchesByPackage = new Map<string, CSharpCandidate[]>();
    for (const match of matches) {
      const packageMatches = matchesByPackage.get(match.packageName) ?? [];
      packageMatches.push(match);
      matchesByPackage.set(match.packageName, packageMatches);
    }

    for (const [packageName, packageMatches] of matchesByPackage) {
      if (packageMatches.length > 1) {
        const fallback = fallbackTarget(fqn);
        packageResolutions.set(`${packageName}\0${fqn}`, {
          name: fqn,
          status: 'ambiguous',
          csharp: fallback,
          typescript: fallback,
          diagnostics: [
            {
              code: 'ambiguous-csharp',
              severity: 'error',
              message: `ApiReference: "${fqn}" resolves to multiple generated C# API members in package "${packageName}".`,
              candidates: packageMatches.map(describeCSharpCandidate).sort(),
            },
          ],
        });
        continue;
      }

      const match = packageMatches[0];
      const csharp = createCSharpTarget(match);
      const typescript = resolveTypescriptTarget(match, csharp, tsIndex);
      packageResolutions.set(`${packageName}\0${fqn}`, {
        name: fqn,
        status: 'resolved',
        csharp,
        typescript: typescript.target,
        diagnostics: typescript.diagnostics,
      });
    }

    if (matches.length > 1) {
      const fallback = fallbackTarget(fqn);
      resolutions.set(fqn, {
        name: fqn,
        status: 'ambiguous',
        csharp: fallback,
        typescript: fallback,
        diagnostics: [
          {
            code: 'ambiguous-csharp',
            severity: 'error',
            message: `ApiReference: "${fqn}" resolves to multiple generated C# API members.`,
            candidates: matches.map(describeCSharpCandidate).sort(),
          },
        ],
      });
      continue;
    }

    resolutions.set(fqn, packageResolutions.get(`${matches[0].packageName}\0${fqn}`)!);
  }

  const missingResolutions = new Map<string, ApiReferenceResolution>();

  return {
    size: packageResolutions.size,
    resolve(name: string, packageName?: string): ApiReferenceResolution {
      const resolved = packageName
        ? packageResolutions.get(`${packageName}\0${name}`)
        : resolutions.get(name);
      if (resolved) return resolved;

      const cacheKey = `${packageName ?? ''}\0${name}`;
      const cached = missingResolutions.get(cacheKey);
      if (cached) return cached;

      const validFqn = API_REFERENCE_FQN_PATTERN.test(name);
      const fallback = fallbackTarget(name);
      const packageCandidates = candidates.get(name);
      const candidatesForDiagnostic = packageCandidates
        ? [...packageCandidates.values()].map(describeCSharpCandidate).sort()
        : validFqn
          ? buildSuggestions(name, fqnsByMemberName)
          : [];
      const missing: ApiReferenceResolution = {
        name,
        status: 'missing',
        csharp: fallback,
        typescript: fallback,
        diagnostics: [
          {
            code: validFqn ? 'missing-csharp' : 'invalid-fqn',
            severity: 'error',
            message:
              validFqn && packageName
                ? `ApiReference: could not resolve "${name}" in package "${packageName}".`
                : validFqn
                  ? `ApiReference: could not resolve "${name}" to a generated C# API member.`
                  : `ApiReference: "${name}" is not a canonical fully qualified API member name.`,
            candidates: candidatesForDiagnostic,
          },
        ],
      };
      missingResolutions.set(cacheKey, missing);
      return missing;
    },
  };
}
