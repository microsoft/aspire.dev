export interface ApiAttribute {
  name?: string;
  constructorArguments?: string[];
  arguments?: Record<string, string>;
}

function normalizeAttributeName(name?: string): string {
  if (!name) return '';
  const shortName = name.split('.').pop() ?? name;
  return shortName.endsWith('Attribute')
    ? shortName.slice(0, -'Attribute'.length)
    : shortName;
}

export function findAttribute(attributes: ApiAttribute[] | undefined, shortName: string): ApiAttribute | undefined {
  return attributes?.find((attribute) => normalizeAttributeName(attribute.name) === shortName);
}

export function hasAttribute(attributes: ApiAttribute[] | undefined, shortName: string): boolean {
  return !!findAttribute(attributes, shortName);
}

export function getAttributeArgument(attribute: ApiAttribute | undefined, name: string): string | undefined {
  return attribute?.arguments?.[name];
}

export function getAttributeFlag(attribute: ApiAttribute | undefined, name: string): boolean {
  return getAttributeArgument(attribute, name) === 'True';
}

/**
 * Compiler-emitted diagnostic IDs that are documented under a different
 * (canonical) slug on this site. The Aspire compiler currently emits
 * `ASPIREDOTNETTOOL` without a numeric suffix, but its documentation lives at
 * the canonical `aspiredotnettool001` slug, consistent with every other
 * `ASPIRE*` diagnostic. Mapping the emitted ID here lets API-reference links
 * resolve to the page that exists instead of being dropped.
 */
const diagnosticSlugAliases: Record<string, string> = {
  aspiredotnettool: 'aspiredotnettool001',
};

/**
 * Resolves a compiler-emitted diagnostic ID to the diagnostics doc slug that
 * actually has a page, honoring known aliases. Returns `null` when no matching
 * page exists so callers can omit the "Learn more" link.
 */
export function resolveDiagnosticSlug(
  experimentalId: string | null | undefined,
  availableSlugs: Set<string> | undefined
): string | null {
  if (!experimentalId) return null;
  const slug = experimentalId.toLowerCase();
  if (availableSlugs?.has(slug)) return slug;
  const alias = diagnosticSlugAliases[slug];
  if (alias && availableSlugs?.has(alias)) return alias;
  return null;
}