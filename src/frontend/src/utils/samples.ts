export interface Sample {
  name: string;
  title: string;
  description: string | null;
  href: string;
  readme: string;
  tags: string[];
  thumbnail: string | null;
}

export interface ResolvedSample extends Sample {
  detailHref: string;
  resolvedThumbnail: ImageMetadata | null;
}

export function sampleSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function sampleDetailHref(base: string, name: string): string {
  const normalizedBase = base.replace(/\/$/, '');
  return `${normalizedBase}/reference/samples/${sampleSlug(name)}/`;
}

export function sampleDescriptionText(description: string | null): string | null {
  if (!description) {
    return null;
  }

  const text = description
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > 0 ? text : null;
}
