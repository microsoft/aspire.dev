import type { StarlightRouteData } from '@astrojs/starlight/route-data';

/**
 * Shared page-metadata helpers used by both the structured-data JSON-LD
 * builder (`structured-data.ts`) and the page-level Open Graph / Twitter card
 * meta tags emitted from `components/starlight/Head.astro`.
 *
 * Keeping a single source of truth here ensures the canonical URL, page
 * title, page description, and resource type stay in sync between the
 * machine-readable JSON-LD payload and the social-card meta tags.
 */

export const DEFAULT_SITE_URL = 'https://aspire.dev';

export const SITE_NAME = 'Aspire';

export const DEFAULT_OG_IMAGE_PATH = '/og-image.png';

export const DEFAULT_OG_IMAGE_WIDTH = 1200;
export const DEFAULT_OG_IMAGE_HEIGHT = 630;

/**
 * Marketing-grade fallback description used for the home page and for any
 * page that somehow lacks a frontmatter `description`. Kept in sync with the
 * organization description in `structured-data.ts` and `astro.config.mjs`.
 */
export const FALLBACK_DESCRIPTION =
  'Aspire streamlines your development workflow with code-first control, ' +
  'modularity, and observability for distributed applications.';

/** Maximum length we trim Open Graph descriptions to. */
const OG_DESCRIPTION_MAX_LENGTH = 200;

/**
 * Known locale path segments. Mirrors `config/locales.ts` but lives here so
 * the OG image endpoint (which runs at build time outside the Astro/Starlight
 * route context) can detect translated entries without importing the locale
 * config from a different module graph.
 */
const NON_DEFAULT_LOCALE_PREFIXES = [
  'da',
  'de',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt-br',
  'ru',
  'tr',
  'uk',
  'zh-cn',
] as const;

const localePrefixPattern = new RegExp(
  `^(?:${NON_DEFAULT_LOCALE_PREFIXES.join('|')})(?:/|$)`,
  'i'
);

const releaseNotePattern = /^whats-new\/aspire-/i;

type RouteEntryData = {
  title: string;
  description?: string;
  category?: 'conceptual' | 'quickstart' | 'tutorial' | 'blog' | 'reference' | 'sample';
  topic?: string;
  ogImage?: string;
  og?: boolean;
  template?: string;
};

type MinimalRoute = Pick<StarlightRouteData, 'entry' | 'entryMeta' | 'head' | 'lang' | 'locale'>;

export type OgType = 'website' | 'article';

export interface OgMetadata {
  /** Page title (without site suffix). */
  title: string;
  /** Composed title used for `<og:title>` and `<twitter:title>`. */
  ogTitle: string;
  /** Page description (defaulted + truncated). */
  description: string;
  /** Absolute canonical URL for the page. */
  url: string;
  /** Open Graph type. */
  type: OgType;
  /** Resolved `og:image` URL. */
  image: string;
  /** `og:image:alt` text. */
  imageAlt: string;
  /** Image pixel dimensions (matches the dynamic template). */
  imageWidth: number;
  imageHeight: number;
  /** True when the URL belongs to the default (English) locale. */
  isDefaultLocale: boolean;
  /** Content path with the locale prefix stripped and the .mdx extension removed. */
  contentBasePath: string;
}

/**
 * Resolve the canonical URL for a page. Prefers an explicit
 * `<link rel="canonical">` injected via starlight `head`, falling back to the
 * current request URL combined with the configured `site`.
 */
export function resolveCanonicalUrl(
  route: MinimalRoute,
  currentUrl: URL,
  site?: URL | string
): string {
  const canonicalHref = route.head.find(
    (entry) =>
      entry.tag === 'link' &&
      entry.attrs?.rel === 'canonical' &&
      typeof entry.attrs.href === 'string'
  )?.attrs?.href;

  if (typeof canonicalHref === 'string') {
    return canonicalHref;
  }

  const siteUrl = resolveSiteUrl(site, currentUrl);
  return ensureTrailingSlash(new URL(currentUrl.pathname, `${siteUrl}/`).href);
}

/**
 * Compute the "content base path" — the entry id with any locale prefix
 * stripped and the `.mdx` / `.md` extension removed (e.g.
 * `de/dashboard/enable-browser-telemetry.mdx` → `dashboard/enable-browser-telemetry`).
 */
export function getContentBasePath(route: MinimalRoute): string {
  const entryId = normalizeEntryId(route.entry.id);
  const localePrefix = route.locale ? `${route.locale}/` : '';
  const contentPath =
    localePrefix && entryId.startsWith(localePrefix) ? entryId.slice(localePrefix.length) : entryId;

  return stripMarkdownExtension(contentPath);
}

/**
 * Best-effort detection of whether a given content path corresponds to the
 * site's home page (with or without a locale prefix). Mirrors the equivalent
 * logic in `structured-data.ts` so the OG type can pick `website` for it.
 */
export function isHomePagePath(contentBasePath: string): boolean {
  return contentBasePath === 'index' || contentBasePath === '';
}

/**
 * Determine the appropriate Open Graph `type` for a page.
 *
 * - Release notes (`whats-new/aspire-*`) and entries flagged as one of the
 *   article-style categories render as `article` — these read as
 *   long-form content with a publication date.
 * - The home page and topic landing splash pages render as `website`.
 * - Everything else defaults to `article` since the docs site is primarily
 *   long-form educational content.
 */
export function resolveOgType(route: MinimalRoute, contentBasePath: string): OgType {
  const data = route.entry.data as RouteEntryData;

  if (isHomePagePath(contentBasePath) || data.template === 'splash') {
    return 'website';
  }

  if (releaseNotePattern.test(contentBasePath)) {
    return 'article';
  }

  switch (data.category) {
    case 'blog':
    case 'tutorial':
    case 'quickstart':
    case 'reference':
    case 'sample':
    case 'conceptual':
      return 'article';
    default:
      return 'article';
  }
}

/**
 * Resolve the description used for OG/Twitter meta tags. Falls back to the
 * marketing description if the entry has none, and trims the result to a
 * social-card-friendly length.
 */
export function resolveOgDescription(route: MinimalRoute): string {
  const description = (route.entry.data as RouteEntryData).description?.trim();
  const candidate = description && description.length > 0 ? description : FALLBACK_DESCRIPTION;
  return truncate(candidate, OG_DESCRIPTION_MAX_LENGTH);
}

/**
 * Resolve the page title shown in social cards. The home page keeps its
 * brand tagline title; every other page is suffixed with `· Aspire` so the
 * site identity is always visible in previews.
 */
export function resolveOgTitle(route: MinimalRoute, contentBasePath: string): string {
  const title = ((route.entry.data as RouteEntryData).title || SITE_NAME).trim();

  if (isHomePagePath(contentBasePath) || (route.entry.data as RouteEntryData).template === 'splash') {
    return title;
  }

  if (title === SITE_NAME) {
    return title;
  }

  return `${title} · ${SITE_NAME}`;
}

/**
 * Build the absolute URL to a per-page OG image. Returns the configured
 * default fallback for non-default-locale pages, explicit opt-outs
 * (`og: false`), explicit overrides (`ogImage: "..."`), and any page where
 * the dynamic generator wouldn't produce a useful image.
 */
export function resolveOgImage(
  route: MinimalRoute,
  contentBasePath: string,
  siteUrl: string,
  isDefaultLocale: boolean
): string {
  const data = route.entry.data as RouteEntryData;

  // Explicit per-page override always wins.
  const override = data.ogImage?.trim();
  if (override) {
    return makeAbsolute(override, siteUrl);
  }

  // Opt-outs and non-default locales fall back to the site-wide image.
  if (data.og === false || !isDefaultLocale) {
    return `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`;
  }

  // Pages that have no dynamic image generated for them — splash pages and
  // the home page itself — also fall back to the site-wide image.
  if (shouldSkipDynamicOgImage(route, contentBasePath)) {
    return `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`;
  }

  return `${siteUrl}/og/${contentBasePath}.png`;
}

/**
 * Whether the dynamic OG image endpoint should skip a given entry. The
 * endpoint and the meta-tag emitter both consult this so the URL written into
 * `og:image` matches the file actually produced at build time.
 */
export function shouldSkipDynamicOgImage(route: MinimalRoute, contentBasePath: string): boolean {
  const data = route.entry.data as RouteEntryData;
  if (data.og === false) return true;
  if (data.template === 'splash') return true;
  if (isHomePagePath(contentBasePath)) return true;
  if (contentBasePath === '404') return true;
  return false;
}

/** Whether a given content base path is in the default (English) locale. */
export function isDefaultLocaleEntry(entryId: string): boolean {
  return !localePrefixPattern.test(normalizeEntryId(entryId));
}

/**
 * One-shot helper that returns every Open Graph value needed by `Head.astro`
 * and the social-card meta builders.
 */
export function getOgMetadata(
  route: MinimalRoute,
  currentUrl: URL,
  site?: URL | string
): OgMetadata {
  const siteUrl = resolveSiteUrl(site, currentUrl);
  const contentBasePath = getContentBasePath(route);
  const url = resolveCanonicalUrl(route, currentUrl, siteUrl);
  const isDefaultLocale = !route.locale;
  const title = ((route.entry.data as RouteEntryData).title || SITE_NAME).trim();
  const ogTitle = resolveOgTitle(route, contentBasePath);
  const description = resolveOgDescription(route);
  const type = resolveOgType(route, contentBasePath);
  const image = resolveOgImage(route, contentBasePath, siteUrl, isDefaultLocale);
  const imageAlt = title;

  return {
    title,
    ogTitle,
    description,
    url,
    type,
    image,
    imageAlt,
    imageWidth: DEFAULT_OG_IMAGE_WIDTH,
    imageHeight: DEFAULT_OG_IMAGE_HEIGHT,
    isDefaultLocale,
    contentBasePath,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function resolveSiteUrl(site: URL | string | undefined, currentUrl: URL): string {
  if (site instanceof URL) {
    return site.href.replace(/\/$/, '');
  }

  if (typeof site === 'string' && site.length > 0) {
    return site.replace(/\/$/, '');
  }

  return new URL('/', currentUrl).href.replace(/\/$/, '');
}

function normalizeEntryId(entryId: string): string {
  return entryId.replace(/\\/g, '/');
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.mdx?$/i, '');
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const trimmed = value.slice(0, max - 1).trimEnd();
  return `${trimmed.replace(/[,.;:!?]+$/, '')}…`;
}

function makeAbsolute(value: string, siteUrl: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${siteUrl}${value}`;
  }
  return `${siteUrl}/${value}`;
}
