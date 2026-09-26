import { memberNameSlug, resolveMemberAnchorMap } from '../api-member-anchors';
import { sampleDescriptionText } from '../samples';
import type {
  ApiReferenceAttribute,
  ApiReferenceDocNode,
  ApiReferenceMember,
  ApiReferencePackageDocument,
  ApiReferenceTarget,
  ApiReferenceType,
} from '../api-reference-core';
import type {
  ExportMapping,
  PrimaryCandidateGroup,
  PrimaryLanguageProvider,
} from './language-provider';

export interface CSharpCandidate {
  fqn: string;
  packageName: string;
  type: ApiReferenceType;
  members: ApiReferenceMember[];
}

export interface CSharpIndex {
  candidates: Map<string, Map<string, CSharpCandidate>>;
  fqnsByMemberName: Map<string, string[]>;
}

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

function genericArity(type: ApiReferenceType): number {
  return type.genericParameters?.length ?? 0;
}

function csharpTypePath(packageName: string, typeName: string, arity: number): string {
  const typeSlug = `${typeName.toLowerCase()}${arity > 0 ? `-${arity}` : ''}`;
  return `/reference/api/csharp/${packageName.toLowerCase()}/${typeSlug}/`;
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

function lowerCamelCase(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function isCallable(kind: string | undefined): boolean {
  return kind ? CALLABLE_KINDS.has(kind) : false;
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

function declaringFullName(candidate: CSharpCandidate): string {
  return normalizeTypeName(
    candidate.type.fullName ??
      `${candidate.type.namespace ? `${candidate.type.namespace}.` : ''}${candidate.type.name}`
  );
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

function declaringTypeNames(candidate: CSharpCandidate, member: ApiReferenceMember): string[] {
  const declaringType = declaringFullName(candidate);
  const receiverTypes = member.isExtension ? extensionReceiverTypes(candidate, member) : [];
  return receiverTypes.length > 0 ? receiverTypes : [declaringType];
}

function getExportMappings(candidate: CSharpCandidate): ExportMapping[] {
  const mappings = new Map<string, ExportMapping>();
  const typeExport = (candidate.type.attributes ?? []).find((attribute) =>
    ASPIRE_EXPORT_ATTRIBUTE.test(attribute.name)
  );
  const exposeMethods = typeExport ? readNamedBoolean(typeExport, 'ExposeMethods') : false;
  const exposeProperties = typeExport ? readNamedBoolean(typeExport, 'ExposeProperties') : false;

  for (const member of candidate.members) {
    const memberDeclaringTypeNames = declaringTypeNames(candidate, member);
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
          required: true,
          allowUntargeted: false,
          declaringTypeNames: memberDeclaringTypeNames,
          isExtension: member.isExtension === true,
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
        required: false,
        allowUntargeted,
        declaringTypeNames: memberDeclaringTypeNames,
        isExtension: member.isExtension === true,
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
        required: false,
        allowUntargeted: false,
        declaringTypeNames: memberDeclaringTypeNames,
        isExtension: member.isExtension === true,
      });
    }
  }

  return [...mappings.values()];
}

function summaryText(summary: unknown): string | undefined {
  if (typeof summary === 'string') {
    return sampleDescriptionText(summary)?.replace(/\s+/g, ' ') || undefined;
  }
  if (!Array.isArray(summary)) return undefined;

  let text = '';
  for (const node of summary as ApiReferenceDocNode[]) {
    const value = node.children
      ? (summaryText(node.children) ?? '')
      : (node.text ?? node.value ?? '');
    const label =
      node.kind === 'cref'
        ? value
            .replace(/^[A-Z]:/, '')
            .replace(/\(.*$/, '')
            .replace(/``?\d+/g, '')
        : value;
    if (text && label && !/\s$/.test(text) && !/^[\s,.:;!?)}\]]/.test(label)) text += ' ';
    text += label;
  }
  return text.replace(/\s+/g, ' ').trim() || undefined;
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

export function normalizeTypeName(value: string): string {
  const withoutAssembly = value.includes('/') ? value.slice(value.indexOf('/') + 1) : value;
  return withoutAssembly
    .trim()
    .replace(/\?$/, '')
    .replace(/^global::/, '')
    .replace(/`\d+/g, '')
    .replace(/<.*>$/, '')
    .replace(/\[\[.*\]\]$/, '');
}

export class CSharpLanguageProvider implements PrimaryLanguageProvider<
  ApiReferencePackageDocument,
  CSharpIndex,
  CSharpCandidate
> {
  readonly id = 'csharp';
  readonly role = 'primary';
  readonly displayName = 'C#';
  readonly code = {
    missing: 'missing-csharp',
    ambiguous: 'ambiguous-csharp',
  } as const;

  buildIndex(packages: readonly ApiReferencePackageDocument[]): CSharpIndex {
    const candidates = new Map<string, Map<string, CSharpCandidate>>();
    const fqnsByMemberName = new Map<string, string[]>();

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

    return { candidates, fqnsByMemberName };
  }

  *enumerate(index: CSharpIndex): Iterable<PrimaryCandidateGroup<CSharpCandidate>> {
    for (const [fqn, groups] of index.candidates) {
      const allMatches = [...groups.values()];
      const matchesByPackage = new Map<string, CSharpCandidate[]>();
      for (const match of allMatches) {
        const packageMatches = matchesByPackage.get(match.packageName) ?? [];
        packageMatches.push(match);
        matchesByPackage.set(match.packageName, packageMatches);
      }
      yield { fqn, matchesByPackage, allMatches };
    }
  }

  lookup(index: CSharpIndex, name: string, packageName?: string): CSharpCandidate[] {
    return [...(index.candidates.get(name)?.values() ?? [])].filter(
      (candidate) => !packageName || candidate.packageName === packageName
    );
  }

  matchOverload(
    candidates: readonly CSharpCandidate[],
    parameterTypes: readonly string[]
  ): CSharpCandidate[] {
    return candidates.flatMap((candidate) =>
      candidate.members
        .filter(
          (member) =>
            isCallable(member.kind) &&
            (member.parameters ?? []).length === parameterTypes.length &&
            (member.parameters ?? []).every(
              (parameter, index) => parameter.type === parameterTypes[index]
            )
        )
        .map((member) => ({ ...candidate, members: [member] }))
    );
  }

  createTarget(
    candidate: CSharpCandidate,
    options: { exactOverload: boolean }
  ): ApiReferenceTarget {
    const member = candidate.members[0];
    const kind = member.kind ?? 'method';
    const anchor = options.exactOverload
      ? resolveMemberAnchorMap(candidate.type.members ?? []).get(member)!.exact
      : memberNameSlug(member);
    const parameters = (member.parameters ?? [])
      .filter((parameter) => !member.isExtension || parameter.modifier !== 'this')
      .map(
        (parameter) =>
          `${parameter.modifier ? `${parameter.modifier} ` : ''}${parameter.type.replace(/\b(?:[A-Za-z_]\w*\.)+/g, '')}${parameter.name ? ` ${parameter.name}` : ''}`
      );
    return {
      label: options.exactOverload ? `${member.name}(${parameters.join(', ')})` : member.name,
      description: summaryText(member.docs?.summary),
      path: `${csharpTypePath(
        candidate.packageName,
        candidate.type.name,
        genericArity(candidate.type)
      )}${MEMBER_KIND_SLUGS[kind] ?? `${kind}s`}/#${anchor}`,
    };
  }

  describeCandidate(candidate: CSharpCandidate): string {
    const signatures = candidate.members
      .map((member) => member.signature)
      .filter((signature): signature is string => Boolean(signature));
    return signatures.length > 0
      ? `${candidate.packageName}: ${signatures.join(' | ')}`
      : `${candidate.packageName}: ${candidate.fqn}`;
  }

  suggestionsFor(index: CSharpIndex, name: string): string[] {
    return buildSuggestions(name, index.fqnsByMemberName);
  }

  exportMappings(candidate: CSharpCandidate): ExportMapping[] {
    return getExportMappings(candidate);
  }

  canonicalMemberName(candidate: CSharpCandidate): string {
    return lowerCamelCase(candidate.members[0].name).toLowerCase();
  }

  packageOf(candidate: CSharpCandidate): string {
    return candidate.packageName;
  }

  fqnOf(candidate: CSharpCandidate): string {
    return candidate.fqn;
  }
}
