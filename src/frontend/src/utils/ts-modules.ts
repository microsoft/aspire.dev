/* ------------------------------------------------------------------ */
/*  Shared helpers for the auto-generated TypeScript API reference.    */
/* ------------------------------------------------------------------ */

import { getCollection } from 'astro:content';

let tsModulesPromise: Promise<any[]> | undefined;
const shouldCacheTsModules = import.meta.env.PROD;

/**
 * Fetch all TypeScript module entries from the content collection.
 * Memoized so Astro's many API routes reuse a single collection load.
 */
export function getTsModules() {
  if (!shouldCacheTsModules) {
    return getCollection('tsModules');
  }

  tsModulesPromise ??= getCollection('tsModules');
  return tsModulesPromise;
}

/** Normalize a module name for use in a URL path segment. */
export function tsModuleSlug(name: string): string {
  return name.toLowerCase();
}

/**
 * Slugify a type or function name for URL use.
 * Converts PascalCase/camelCase to lowercase.
 */
export function tsSlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ---- Capability kind helpers ---------------------------------------- */

/** Ordered list of capability kinds for consistent display. */
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

/* ---- Type kind helpers ---------------------------------------------- */

export const typeKindOrder = ['handle', 'dto', 'enum'] as const;

export const typeKindLabels: Record<string, string> = {
  handle: 'Types',
  dto: 'Types',
  enum: 'Enums',
};

/* ---- Grouping helpers ----------------------------------------------- */

/**
 * Group functions by their capability kind, maintaining a meaningful order.
 */
export function groupFunctionsByKind(functions: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const kind of capabilityKindOrder) {
    const matching = functions.filter((f: any) => f.kind === kind);
    if (matching.length > 0) {
      groups.set(
        kind,
        matching.sort((a: any, b: any) => a.name.localeCompare(b.name))
      );
    }
  }
  return groups;
}

/**
 * Group top-level functions by their target handle type for display.
 * Returns a map from handle type display name to the functions that target it.
 */
export function groupFunctionsByTarget(functions: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const func of functions) {
    const targetId = func.targetTypeId as string | undefined;
    if (!targetId) continue;

    // Extract simple name from "Assembly/Full.Type.Name"
    const slashIdx = targetId.indexOf('/');
    const fullName = slashIdx >= 0 ? targetId.slice(slashIdx + 1) : targetId;
    const simpleName = fullName.split('.').pop() ?? fullName;

    const existing = groups.get(simpleName) ?? [];
    existing.push(func);
    groups.set(simpleName, existing);
  }

  // Sort functions within each group
  for (const [, funcs] of groups) {
    funcs.sort((a: any, b: any) => a.name.localeCompare(b.name));
  }

  return groups;
}

/* ---- Link helpers --------------------------------------------------- */

/**
 * Build an absolute href for a TypeScript API module page.
 */
export function tsModuleHref(base: string, moduleName: string): string {
  const b = base.replace(/\/$/, '');
  return `${b}/reference/api/typescript/${tsModuleSlug(moduleName)}/`;
}

/**
 * Build an absolute href for a TypeScript API type/function page.
 */
export function tsItemHref(base: string, moduleName: string, itemName: string): string {
  const b = base.replace(/\/$/, '');
  return `${b}/reference/api/typescript/${tsModuleSlug(moduleName)}/${tsSlugify(itemName)}/`;
}

/* ---- Signature formatting ------------------------------------------- */

/**
 * Format a TypeScript function signature for display.
 * If the signature has 2+ parameters, each param is placed on its own line
 * with 4-space indentation — matching the C# formatting convention.
 */
export function formatTsSignature(sig: string): string {
  if (!sig) return sig;

  const openIdx = sig.indexOf('(');
  if (openIdx < 0) return sig;

  // Find the matching close paren (respecting nesting)
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < sig.length; i++) {
    if (sig[i] === '(' || sig[i] === '<') depth++;
    else if (sig[i] === ')' || sig[i] === '>') depth--;
    if (sig[i] === ')' && depth === 0) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx <= openIdx) return sig;

  const prefix = sig.slice(0, openIdx + 1);
  const suffix = sig.slice(closeIdx);
  const paramStr = sig.slice(openIdx + 1, closeIdx);

  // Split params respecting nested parens/angles (for callback types)
  const params: string[] = [];
  let current = '';
  depth = 0;
  for (const ch of paramStr) {
    if (ch === '(' || ch === '<') depth++;
    else if (ch === ')' || ch === '>') depth--;
    if (ch === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(current.trim());

  // Single param or empty — keep inline
  if (params.length <= 1) return sig;

  // Multi-param — wrap each on its own line
  const indent = '    ';
  return (
    prefix +
    '\n' +
    params
      .map((p, i) => {
        const sep = i < params.length - 1 ? ',' : '';
        return indent + p + sep;
      })
      .join('\n') +
    suffix
  );
}

/**
 * Simplify a fully-qualified type reference for display.
 * Strips assembly prefixes, assembly-qualified generic metadata, and extracts simple names.
 */
export function simplifyType(typeRef: string): string {
  // Strip "Assembly/" prefix
  const slashIdx = typeRef.indexOf('/');
  let stripped = slashIdx >= 0 ? typeRef.slice(slashIdx + 1) : typeRef;

  // Clean assembly metadata from generic type arguments:
  // System.IEquatable`1[[TypeName, Assembly, Version=..., ...]] → System.IEquatable`1[[TypeName]]
  stripped = stripped.replace(/\[\[([^\],]+),\s*[^\]]*\]\]/g, '[[$1]]');

  // For generic types with angle brackets, simplify the outer name only
  if (stripped.includes('<')) {
    const angleIdx = stripped.indexOf('<');
    const prefix = stripped.slice(0, angleIdx);
    const suffix = stripped.slice(angleIdx);
    return (prefix.split('.').pop() ?? prefix) + suffix;
  }

  return stripped.split('.').pop() ?? stripped;
}

/**
 * Format a callback parameter for display.
 */
export function formatCallbackParam(param: any): string {
  if (param.callbackSignature) {
    return param.callbackSignature;
  }
  return param.type;
}
