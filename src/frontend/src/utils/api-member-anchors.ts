import { freezeApiData } from './api-data';

export interface ApiMemberAnchor {
  name: string;
  kind?: string;
  signature?: string;
  genericParameters?: unknown[];
  parameters?: { type: string; modifier?: string }[];
}

export interface ResolvedMemberAnchor {
  exact: string;
  aliases: string[];
}

const stableMembers = new WeakSet<ApiMemberAnchor[]>();
const anchorCache = new WeakMap<ApiMemberAnchor[], ResolvedMemberAnchor[]>();
const anchorMapCache = new WeakMap<ApiMemberAnchor[], ReadonlyMap<ApiMemberAnchor, ResolvedMemberAnchor>>();

export function prepareMemberAnchors(members: ApiMemberAnchor[]): void {
  freezeApiData(members);
  stableMembers.add(members);
}

export function memberNameSlug(member: Pick<ApiMemberAnchor, 'name'>): string {
  const name = member.name === '.ctor' ? 'constructor' : member.name;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function memberSlug(member: ApiMemberAnchor): string {
  let base = member.name === '.ctor' ? 'constructor' : member.name;
  if (member.kind === 'indexer' && member.parameters?.length) {
    const paramTypes = member.parameters.map((parameter) => shortTypeName(parameter.type)).join(', ');
    base = `this[${paramTypes}]`;
  } else if ((member.kind === 'method' || member.kind === 'constructor') && member.parameters) {
    const paramTypes = member.parameters.map((parameter) => shortTypeName(parameter.type)).join(', ');
    base = `${base}(${paramTypes})`;
  }
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function signatureDiscriminator(member: ApiMemberAnchor): string {
  const signature =
    member.signature ??
    [
      member.kind ?? '',
      member.name,
      `generic:${member.genericParameters?.length ?? 0}`,
      ...(member.parameters ?? []).map(
        (parameter) => `${parameter.modifier ?? ''}:${parameter.type}`
      ),
    ].join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < signature.length; index++) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function resolveMemberAnchors(
  members: ApiMemberAnchor[]
): ResolvedMemberAnchor[] {
  const cached = anchorCache.get(members);
  if (cached) return cached;
  const baseAnchors = members.map(memberSlug);
  const baseCounts = new Map<string, number>();
  for (const anchor of baseAnchors) {
    baseCounts.set(anchor, (baseCounts.get(anchor) ?? 0) + 1);
  }

  const usedExactAnchors = new Set<string>();
  const exactAnchors = baseAnchors.map((baseAnchor, index) => {
    const initial =
      (baseCounts.get(baseAnchor) ?? 0) > 1
        ? `${baseAnchor}-${signatureDiscriminator(members[index])}`
        : baseAnchor;
    let exact = initial;
    let duplicateIndex = 2;
    while (usedExactAnchors.has(exact)) {
      exact = `${initial}-${duplicateIndex}`;
      duplicateIndex++;
    }
    usedExactAnchors.add(exact);
    return exact;
  });

  const reservedExactAnchors = new Set(exactAnchors);
  const claimedAliases = new Set<string>();

  const resolved = members.map((member, index) => {
    const nameAnchor = memberNameSlug(member);
    const baseAnchor = baseAnchors[index];
    const exactAnchor = exactAnchors[index];
    const aliases: string[] = [];
    const candidates = [
      nameAnchor,
      (baseCounts.get(baseAnchor) ?? 0) > 1 ? baseAnchor : undefined,
    ];

    for (const candidate of candidates) {
      if (
        !candidate ||
        candidate === exactAnchor ||
        aliases.includes(candidate) ||
        reservedExactAnchors.has(candidate) ||
        claimedAliases.has(candidate)
      ) {
        continue;
      }

      claimedAliases.add(candidate);
      aliases.push(candidate);
    }

    return { exact: exactAnchor, aliases };
  });
  if (stableMembers.has(members)) {
    freezeApiData(resolved);
    anchorCache.set(members, resolved);
  }
  return resolved;
}

export function resolveMemberAnchorMap(
  members: ApiMemberAnchor[]
): ReadonlyMap<ApiMemberAnchor, ResolvedMemberAnchor> {
  const cached = anchorMapCache.get(members);
  if (cached) return cached;
  const resolved = resolveMemberAnchors(members);
  const map = new Map(members.map((member, index) => [member, resolved[index]] as const));
  if (stableMembers.has(members)) anchorMapCache.set(members, map);
  return map;
}

export function memberAnchorAliases(
  members: ApiMemberAnchor[]
): Array<string | undefined> {
  return resolveMemberAnchors(members).map(({ aliases }) => aliases[0]);
}

export function shortTypeName(fullName: string): string {
  let firstAngle = -1;
  for (let index = 0; index < fullName.length; index++) {
    if (fullName[index] === '<') {
      firstAngle = index;
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

  for (const character of argsContent) {
    if (character === '<') depth++;
    if (character === '>') depth--;
    if (character === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) args.push(current.trim());

  return `${outerShort}<${args.map((argument) => shortTypeName(argument)).join(', ')}>`;
}
