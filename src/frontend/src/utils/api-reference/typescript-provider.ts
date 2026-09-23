import { sampleDescriptionText } from '../samples';
import {
  getTsItemSlug,
  getTsMemberAnchor,
  getTsMethodSlug,
  getTsTopLevelRouteItems,
} from '../ts-api-routes';
import type {
  ApiReferenceDiagnostic,
  ApiReferenceTarget,
  ApiReferenceTsCallable,
  ApiReferenceTsDocument,
} from '../api-reference-core';
import type {
  ExportMapping,
  PrimaryResolutionContext,
  TargetLanguageProvider,
} from './language-provider';

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
  parameters?: ApiReferenceTsCallable['parameters'];
  description?: string;
}

interface TsRouteIndex {
  byCapabilityId: Map<string, TsRouteCandidate[]>;
  byModuleAndName: Map<string, TsRouteCandidate[]>;
  byName: Map<string, TsRouteCandidate[]>;
}

const CALLABLE_KINDS = new Set(['method', 'constructor', 'Method', 'InstanceMethod']);

function addToIndex<T>(index: Map<string, T[]>, key: string | undefined, value: T): void {
  if (!key) return;
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
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

function simpleTypeName(value: string): string {
  const normalized = normalizeTypeName(value);
  return normalized.slice(normalized.lastIndexOf('.') + 1);
}

function isCallable(kind: string | undefined): boolean {
  return kind ? CALLABLE_KINDS.has(kind) : false;
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
        parameters: fn.parameters,
        description: fn.description,
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
          parameters: capability.parameters,
          description: capability.description,
        });
      }
    }
  }

  return { byCapabilityId, byModuleAndName, byName };
}

function candidateMatchesMapping(route: TsRouteCandidate, mapping: ExportMapping): boolean {
  const normalizedExpectedTypes = mapping.declaringTypeNames.map(normalizeTypeName);
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
  context: PrimaryResolutionContext,
  tsIndex: TsRouteIndex
): { matches: TsRouteCandidate[]; suggestions: TsRouteCandidate[] } {
  if (mapping.capabilityId) {
    const exact = tsIndex.byCapabilityId.get(mapping.capabilityId) ?? [];
    if (exact.length > 0) {
      return { matches: preferredTsCandidates(exact), suggestions: exact };
    }
  }

  const named =
    tsIndex.byModuleAndName.get(`${context.packageName}\0${mapping.methodName.toLowerCase()}`) ??
    [];
  const targeted = named.filter((route) => candidateMatchesMapping(route, mapping));

  if (targeted.length > 0) {
    return { matches: preferredTsCandidates(targeted), suggestions: named };
  }

  if (mapping.allowUntargeted) {
    const globalNamed = tsIndex.byName.get(mapping.methodName.toLowerCase()) ?? [];
    const globalTargeted = globalNamed.filter((route) => candidateMatchesMapping(route, mapping));
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

export class TypeScriptLanguageProvider implements TargetLanguageProvider<
  ApiReferenceTsDocument,
  TsRouteIndex
> {
  readonly id = 'typescript';
  readonly role = 'target';

  buildIndex(documents: readonly ApiReferenceTsDocument[]): TsRouteIndex {
    return buildTsRouteIndex(documents);
  }

  resolveTarget(
    context: PrimaryResolutionContext,
    primaryTarget: ApiReferenceTarget,
    index: TsRouteIndex,
    options: { exactOverload: boolean }
  ): { target: ApiReferenceTarget; diagnostics: ApiReferenceDiagnostic[] } {
    if (context.mappings.length === 0) {
      return {
        target: { label: primaryTarget.label },
        diagnostics: [
          {
            code: 'missing-typescript',
            severity: 'warning',
            message: `ApiReference: "${context.fqn}" has no TypeScript export; the C# API name is shown without a TypeScript link.`,
            candidates: [],
          },
        ],
      };
    }

    const matches: TsRouteCandidate[] = [];
    const suggestions: TsRouteCandidate[] = [];
    let unresolved = false;

    for (const mapping of context.mappings) {
      const result = findTsCandidates(mapping, context, index);
      suggestions.push(...result.suggestions);
      if (result.matches.length === 0) {
        unresolved ||= mapping.required;
        continue;
      }
      matches.push(...result.matches);
    }

    const canonicalName = context.canonicalName;
    const canonicalMatches = canonicalName
      ? matches.filter((match) => match.name.toLowerCase() === canonicalName)
      : [];
    const preferred = preferredTsCandidates(
      canonicalMatches.length > 0 ? canonicalMatches : matches
    );
    const candidateDescriptions = deduplicateTsCandidates(
      suggestions.length > 0 ? suggestions : matches
    )
      .map(describeTsCandidate)
      .sort();

    if (unresolved) {
      return {
        target: { label: primaryTarget.label },
        diagnostics: [
          {
            code: 'unresolved-typescript-export',
            severity: 'error',
            message: `ApiReference: "${context.fqn}" declares a TypeScript export, but no generated TypeScript API matched it.`,
            candidates: candidateDescriptions,
          },
        ],
      };
    }

    if (preferred.length === 0) {
      return {
        target: { label: primaryTarget.label },
        diagnostics: [
          {
            code: 'missing-typescript',
            severity: 'warning',
            message: `ApiReference: "${context.fqn}" has no TypeScript export; the C# API name is shown without a TypeScript link.`,
            candidates: candidateDescriptions,
          },
        ],
      };
    }

    if (preferred.length > 1) {
      return {
        target: { label: primaryTarget.label },
        diagnostics: [
          {
            code: 'ambiguous-typescript',
            severity: 'error',
            message: `ApiReference: "${context.fqn}" maps to multiple generated TypeScript APIs.`,
            candidates: preferred.map(describeTsCandidate).sort(),
          },
        ],
      };
    }

    const match = preferred[0];
    return {
      target: {
        description:
          sampleDescriptionText(match.description ?? null)?.replace(/\s+/g, ' ') || undefined,
        label:
          options.exactOverload && isCallable(match.kind)
            ? `${match.name}(${(match.parameters ?? [])
                .map((parameter) => {
                  const type = parameter.callbackSignature ?? parameter.type;
                  return parameter.name
                    ? `${parameter.name}${parameter.isOptional ? '?' : ''}${type ? `: ${type}` : ''}`
                    : type;
                })
                .join(', ')})`
            : match.name,
        path: match.path,
      },
      diagnostics: [],
    };
  }
}
