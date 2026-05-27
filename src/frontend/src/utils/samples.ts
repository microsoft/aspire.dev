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
