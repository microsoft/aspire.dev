import { sampleDescriptionText } from '../samples';
import {
  getGoItemSlug,
  getGoMemberAnchor,
  getGoMethods,
  getGoMethodSlug,
  getGoStandaloneFunctions,
  getGoTopLevelRouteItems,
} from '../go-api-routes';
import type { ApiReferenceDiagnostic, ApiReferenceTarget } from '../api-reference-core';
import type {
  ExportMapping,
  PrimaryResolutionContext,
  TargetLanguageProvider,
} from './language-provider';

interface GoCallable {
  name: string;
  description?: string;
  kind?: string;
  capabilityId?: string;
  qualifiedName?: string;
  targetTypeId?: string;
  expandedTargetTypes?: string[];
}

interface GoHandle {
  name: string;
  fullName?: string;
  capabilities?: GoCallable[];
}

export interface ApiReferenceGoDocument {
  package: { name: string };
  functions?: GoCallable[];
  handleTypes?: GoHandle[];
  dtoTypes?: { name: string; fullName?: string }[];
  enumTypes?: { name: string; fullName?: string }[];
}

interface GoRouteCandidate {
  moduleName: string;
  name: string;
  capabilityId?: string;
  qualifiedName?: string;
  targetTypeId?: string;
  expandedTargetTypes: string[];
  parentTypeFullName?: string;
  path: string;
  priority: number;
  description?: string;
}

interface GoRouteIndex {
  byCapabilityId: Map<string, GoRouteCandidate[]>;
  byModuleAndName: Map<string, GoRouteCandidate[]>;
}

function addToIndex<T>(index: Map<string, T[]>, key: string | undefined, value: T): void {
  if (!key) return;
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
}

function normalizeTypeName(value: string): string {
  const withoutAssembly = value.includes('/') ? value.slice(value.indexOf('/') + 1) : value;
  return withoutAssembly
    .trim()
    .replace(/\?$/, '')
    .replace(/^global::/, '')
    .replace(/`\d+/g, '')
    .replace(/<.*>$/, '');
}

function simpleTypeName(value: string): string {
  const normalized = normalizeTypeName(value);
  return normalized.slice(normalized.lastIndexOf('.') + 1);
}

function buildGoRouteIndex(modules: readonly ApiReferenceGoDocument[]): GoRouteIndex {
  const byCapabilityId = new Map<string, GoRouteCandidate[]>();
  const byModuleAndName = new Map<string, GoRouteCandidate[]>();

  const register = (candidate: GoRouteCandidate) => {
    addToIndex(byCapabilityId, candidate.capabilityId, candidate);
    addToIndex(
      byModuleAndName,
      `${candidate.moduleName}\0${candidate.name.toLowerCase()}`,
      candidate
    );
  };

  for (const module of modules) {
    const moduleName = module.package.name;
    const modulePath = `/reference/api/go/${moduleName.toLowerCase()}`;
    const topLevelItems = getGoTopLevelRouteItems(module);

    for (const fn of getGoStandaloneFunctions(module)) {
      register({
        moduleName,
        name: fn.name,
        capabilityId: fn.capabilityId,
        qualifiedName: fn.qualifiedName,
        targetTypeId: fn.targetTypeId,
        expandedTargetTypes: fn.expandedTargetTypes ?? [],
        path: `${modulePath}/${getGoItemSlug(fn, topLevelItems)}/`,
        priority: 0,
        description: fn.description,
      });
    }

    for (const handle of module.handleTypes ?? []) {
      const itemSlug = getGoItemSlug(handle, topLevelItems);
      const methods = getGoMethods(handle);

      for (const capability of handle.capabilities ?? []) {
        let path: string | undefined;
        let priority = 1;

        if (capability.kind === 'Method' || capability.kind === 'InstanceMethod') {
          path = `${modulePath}/${itemSlug}/${getGoMethodSlug(capability, methods, handle.name)}/`;
        } else if (capability.kind === 'PropertyGetter' || capability.kind === 'PropertySetter') {
          path = `${modulePath}/${itemSlug}/#${getGoMemberAnchor(capability.name)}`;
          priority = capability.kind === 'PropertyGetter' ? 1 : 2;
        }

        if (!path) continue;

        register({
          moduleName,
          name: capability.name,
          capabilityId: capability.capabilityId,
          qualifiedName: capability.qualifiedName,
          targetTypeId: capability.targetTypeId,
          expandedTargetTypes: capability.expandedTargetTypes ?? [],
          parentTypeFullName: handle.fullName,
          path,
          priority,
          description: capability.description,
        });
      }
    }
  }

  return { byCapabilityId, byModuleAndName };
}

function candidateMatchesMapping(route: GoRouteCandidate, mapping: ExportMapping): boolean {
  const expectedTypes = mapping.declaringTypeNames.map(normalizeTypeName);
  const targetTypes = [
    route.parentTypeFullName,
    route.targetTypeId,
    ...route.expandedTargetTypes,
  ].filter((value): value is string => Boolean(value));

  return targetTypes.some((targetType) => {
    const normalized = normalizeTypeName(targetType);
    return (
      expectedTypes.includes(normalized) ||
      expectedTypes.map(simpleTypeName).includes(simpleTypeName(normalized))
    );
  });
}

function preferredGoCandidates(candidates: readonly GoRouteCandidate[]): GoRouteCandidate[] {
  const unique = new Map<string, GoRouteCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.path}\0${candidate.name}`;
    const current = unique.get(key);
    if (!current || candidate.priority < current.priority) unique.set(key, candidate);
  }
  const values = [...unique.values()];
  if (values.length <= 1) return values;
  const priority = Math.min(...values.map((candidate) => candidate.priority));
  return values.filter((candidate) => candidate.priority === priority);
}

function findGoCandidates(
  mapping: ExportMapping,
  context: PrimaryResolutionContext,
  index: GoRouteIndex
): GoRouteCandidate[] {
  if (mapping.capabilityId) {
    const exact = index.byCapabilityId.get(mapping.capabilityId) ?? [];
    if (exact.length > 0) return preferredGoCandidates(exact);
  }

  const named =
    index.byModuleAndName.get(`${context.packageName}\0${mapping.methodName.toLowerCase()}`) ?? [];
  return preferredGoCandidates(named.filter((route) => candidateMatchesMapping(route, mapping)));
}

/**
 * Resolves the Go AppHost reference for a C# API. Go coverage is partial and some
 * members are renamed (for example `WithRoleAssignments` becomes
 * `WithSearchRoleAssignments`), so an API without a generated Go match stays unlinked
 * without raising a diagnostic.
 */
export class GoLanguageProvider implements TargetLanguageProvider<
  ApiReferenceGoDocument,
  GoRouteIndex
> {
  readonly id = 'go';
  readonly role = 'target';

  buildIndex(documents: readonly ApiReferenceGoDocument[]): GoRouteIndex {
    return buildGoRouteIndex(documents);
  }

  resolveTarget(
    context: PrimaryResolutionContext,
    primaryTarget: ApiReferenceTarget,
    index: GoRouteIndex
  ): { target: ApiReferenceTarget; diagnostics: ApiReferenceDiagnostic[] } {
    const unresolved = { target: { label: primaryTarget.label }, diagnostics: [] };
    const matches = context.mappings.flatMap((mapping) =>
      findGoCandidates(mapping, context, index)
    );
    const canonical = matches.filter((match) => match.name.toLowerCase() === context.canonicalName);
    const preferred = preferredGoCandidates(canonical.length > 0 ? canonical : matches);
    if (preferred.length !== 1) return unresolved;

    const match = preferred[0];
    return {
      target: {
        description:
          sampleDescriptionText(match.description ?? null)?.replace(/\s+/g, ' ') || undefined,
        label: match.name,
        path: match.path,
      },
      diagnostics: [],
    };
  }
}
