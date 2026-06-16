export type AppHostKind = 'typescript' | 'csproj' | 'file-based';
export type SampleImageTheme = 'light' | 'dark';

export interface ThemeAwareSampleImage {
  light: string;
  dark: string;
}

export type SampleThumbnail = string | ThemeAwareSampleImage | null;

export interface ResolvedThemeAwareSampleImage {
  light: ImageMetadata;
  dark: ImageMetadata;
}

export type ResolvedSampleThumbnail = ImageMetadata | ResolvedThemeAwareSampleImage | null;

export interface Sample {
  name: string;
  title: string;
  description: string | null;
  href: string;
  readme: string;
  readmeRaw?: string;
  tags: string[];
  thumbnail: SampleThumbnail;
  appHost?: AppHostKind | null;
  appHostPath?: string | null;
  appHostCode?: string | null;
}

export interface ResolvedSample extends Sample {
  detailHref: string;
  resolvedThumbnail: ResolvedSampleThumbnail;
}

export function isThemeAwareSampleImage(image: SampleThumbnail): image is ThemeAwareSampleImage {
  return (
    typeof image === 'object' &&
    image !== null &&
    typeof image.light === 'string' &&
    typeof image.dark === 'string'
  );
}

export function isResolvedThemeAwareSampleImage(
  image: ResolvedSampleThumbnail
): image is ResolvedThemeAwareSampleImage {
  return typeof image === 'object' && image !== null && 'light' in image && 'dark' in image;
}

export function sampleImageTheme(src: string): SampleImageTheme | null {
  const hashIndex = src.indexOf('#');
  if (hashIndex === -1) {
    return null;
  }

  const hash = src.slice(hashIndex + 1).toLowerCase();
  if (hash === 'gh-light-mode-only') {
    return 'light';
  }

  if (hash === 'gh-dark-mode-only') {
    return 'dark';
  }

  return null;
}

export function stripSampleImageUrlSuffix(src: string): string {
  const suffixIndex = src.search(/[?#]/);
  return suffixIndex === -1 ? src : src.slice(0, suffixIndex);
}

export function normalizeThemeImageAlt(alt: string): string {
  return alt
    .replace(/\s*\((?:light|dark)(?:\s+mode)?\)\s*$/i, '')
    .replace(/\s+in\s+(?:light|dark)\s+mode\s*$/i, '')
    .trim();
}

export function appHostLabel(kind: AppHostKind): string {
  switch (kind) {
    case 'typescript':
      return 'TypeScript AppHost';
    case 'csproj':
      return 'C# AppHost';
    case 'file-based':
      return 'File-based AppHost';
  }
}

export function appHostShortLabel(kind: AppHostKind): string {
  switch (kind) {
    case 'typescript':
      return 'TypeScript';
    case 'csproj':
      return 'C# (csproj)';
    case 'file-based':
      return 'File-based';
  }
}

/**
 * Map an AppHost kind to a Starlight icon name where one is a clean fit.
 * Returns `null` for `'csproj'` so callers can render their own custom glyph
 * (an XML-style angle-bracket mark) instead of a misleading C# letterform.
 *
 * The return type is a subset of `StarlightIcon` so consumers can pass it
 * straight into `<Icon name={...}>` without a cast.
 */
export type SampleAppHostIcon = 'seti:typescript' | 'seti:c-sharp';

export function appHostIconName(kind: AppHostKind | null | undefined): SampleAppHostIcon | null {
  if (kind === 'typescript') return 'seti:typescript';
  if (kind === 'file-based') return 'seti:c-sharp';
  return null;
}

/**
 * Map the AppHost entry-point file extension to an expressive-code language
 * identifier so syntax highlighting matches the file. Treats Aspire 13.4's
 * `apphost.mts` (TypeScript module) the same as the legacy `apphost.ts`.
 */
export function appHostCodeLang(path: string | null | undefined): string {
  if (!path) return 'text';
  const lower = path.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.mts')) return 'typescript';
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.csproj')) return 'xml';
  return 'text';
}

/**
 * Extract the basename of the AppHost entry-point path. This is used as the
 * rendered title of the code block (e.g., "AppHost.cs", "apphost.mts").
 */
export function appHostCodeTitle(path: string | null | undefined): string | null {
  if (!path) return null;
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
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

const SAMPLES_RAW_BASE = 'https://raw.githubusercontent.com/dotnet/aspire-samples/main/samples';

interface BuildSampleMarkdownOptions {
  appHostLabel: (kind: AppHostKind) => string;
}

/**
 * Render the markdown payload served at /reference/samples/{slug}.md so the
 * page-actions plugin's "Copy Markdown" and "View Markdown" actions return a
 * portable, LLM-friendly document.
 *
 * The base content is the original upstream README (readmeRaw); relative image
 * paths are rewritten to absolute GitHub raw URLs so they resolve when the
 * markdown is opened in a browser or pasted into another tool.
 */
export function buildSampleMarkdown(sample: Sample, options: BuildSampleMarkdownOptions): string {
  const body = rewriteSampleImageUrls(sample.readmeRaw ?? sample.readme, sample.name);

  const metaLines = [
    `> **Source:** [${sample.name}](${sample.href})`,
    sample.appHost ? `> **AppHost:** ${options.appHostLabel(sample.appHost)}` : null,
    sample.tags.length > 0 ? `> **Tags:** ${sample.tags.join(', ')}` : null,
  ].filter((line): line is string => line !== null);

  const preamble = metaLines.join('\n');

  return `${preamble}\n\n${body.trim()}\n`;
}

/**
 * Convert README image references to absolute GitHub raw URLs.
 *
 * - `~/assets/samples/<name>/<file>` (already rewritten by the generator) →
 *   we can't recover the original upstream path here, so leave it alone; the
 *   rewritten path won't resolve outside the site but the alt text is intact.
 * - Relative paths inside `readmeRaw` (e.g., `./images/foo.png` or
 *   `images/foo.png`) → rewritten to `https://raw.githubusercontent.com/.../samples/<name>/...`
 *   so they render anywhere the markdown is opened.
 */
function rewriteSampleImageUrls(markdown: string, sampleName: string): string {
  const baseUrl = `${SAMPLES_RAW_BASE}/${sampleName}`;

  return markdown.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g,
    (_match, alt: string, src: string, title?: string) => {
      if (/^(?:https?:)?\/\//.test(src) || src.startsWith('data:')) {
        return `![${alt}](${src}${title ?? ''})`;
      }

      if (src.startsWith('~/')) {
        return `![${alt}](${src}${title ?? ''})`;
      }

      const cleaned = src.replace(/^\.\//, '').replace(/^\//, '');
      return `![${alt}](${baseUrl}/${cleaned}${title ?? ''})`;
    }
  );
}
