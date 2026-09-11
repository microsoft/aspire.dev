import type { CollectionEntry } from 'astro:content';

import {
  type AppHostApiField as TsField,
  type AppHostApiParameter as TsFunctionParameter,
  type ProjectedAppHostModule as TsApiDocument,
  type ProjectedDtoType as TsDtoType,
  type ProjectedEnumType as TsEnumType,
  type ProjectedFunction as TsFunction,
  type ProjectedHandleType as TsHandleType,
  type ProjectedNamedItem as TsNamedItem,
  appHostModuleSlug as tsModuleSlug,
  appHostSlugify as tsSlugify,
  getAppHostModules,
  projectAppHostModule,
} from './apphost-modules';

export type {
  TsApiDocument,
  TsDtoType,
  TsEnumType,
  TsField,
  TsFunction,
  TsFunctionParameter,
  TsHandleType,
  TsNamedItem,
};
export { tsModuleSlug, tsSlugify };

export type TsModuleCollectionEntry = Omit<CollectionEntry<'apphostModules'>, 'data'> & {
  data: TsApiDocument;
};

export async function getTsModules(): Promise<TsModuleCollectionEntry[]> {
  const modules = await getAppHostModules();
  return modules.map((entry) => ({
    ...entry,
    data: projectAppHostModule(entry.data, 'typescript'),
  }));
}

export const capabilityKindOrder = [
  'Method',
  'InstanceMethod',
  'PropertyGetter',
  'PropertySetter',
] as const;

export const capabilityKindLabels: Record<string, string> = {
  Method: 'Methods',
  InstanceMethod: 'Instance Methods',
  PropertyGetter: 'Property Getters',
  PropertySetter: 'Property Setters',
};

export const typeKindOrder = ['handle', 'dto', 'enum'] as const;

export const typeKindLabels: Record<string, string> = {
  handle: 'Types',
  dto: 'Types',
  enum: 'Enums',
};

export function groupFunctionsByKind(functions: TsFunction[]): Map<string, TsFunction[]> {
  const groups = new Map<string, TsFunction[]>();
  for (const kind of capabilityKindOrder) {
    const matching = functions.filter((fn) => fn.kind === kind);
    if (matching.length > 0) {
      groups.set(kind, matching.sort((left, right) => left.name.localeCompare(right.name)));
    }
  }
  return groups;
}

export function groupFunctionsByTarget(functions: TsFunction[]): Map<string, TsFunction[]> {
  const groups = new Map<string, TsFunction[]>();
  for (const fn of functions) {
    if (!fn.targetTypeId) continue;
    const target = simplifyType(fn.targetTypeId);
    const entries = groups.get(target) ?? [];
    entries.push(fn);
    groups.set(target, entries);
  }
  return groups;
}

export function tsModuleHref(base: string, moduleName: string): string {
  return `${base.replace(/\/$/, '')}/reference/api/apphost/${tsModuleSlug(moduleName)}/`;
}

export function tsItemHref(base: string, moduleName: string, itemName: string): string {
  return `${tsModuleHref(base, moduleName)}${tsSlugify(itemName)}/`;
}

export function formatTsSignature(signature: string): string {
  if (!signature) return signature;
  const open = signature.indexOf('(');
  if (open < 0) return signature;
  let depth = 0;
  let close = -1;
  for (let index = open; index < signature.length; index++) {
    if (signature[index] === '(' || signature[index] === '<') depth++;
    if (signature[index] === ')' || signature[index] === '>') depth--;
    if (signature[index] === ')' && depth === 0) {
      close = index;
      break;
    }
  }
  if (close <= open) return signature;

  const params: string[] = [];
  let current = '';
  depth = 0;
  for (const character of signature.slice(open + 1, close)) {
    if (character === '(' || character === '<') depth++;
    if (character === ')' || character === '>') depth--;
    if (character === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) params.push(current.trim());
  if (params.length <= 1) return signature;
  return `${signature.slice(0, open + 1)}\n${params
    .map((parameter, index) => `    ${parameter}${index < params.length - 1 ? ',' : ''}`)
    .join('\n')}${signature.slice(close)}`;
}

export function simplifyType(typeRef: string): string {
  const afterSlash = typeRef.includes('/') ? typeRef.slice(typeRef.lastIndexOf('/') + 1) : typeRef;
  const genericIndex = afterSlash.indexOf('<');
  if (genericIndex >= 0) {
    const prefix = afterSlash.slice(0, genericIndex);
    return `${prefix.split('.').pop() ?? prefix}${afterSlash.slice(genericIndex)}`;
  }
  return afterSlash.split('.').pop() ?? afterSlash;
}

export function formatCallbackParam(parameter: TsFunctionParameter): string {
  return parameter.callbackSignature ?? parameter.type;
}
