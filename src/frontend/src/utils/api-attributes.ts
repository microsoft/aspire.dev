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