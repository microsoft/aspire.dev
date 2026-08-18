import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { stripApiReferenceLocale } from './utils/api-reference-routes';
import { getOgMetadata } from './utils/page-metadata';

/**
 * Custom route middleware that applies implicit pagination rules:
 *
 * 1. Group boundary rules — within each topic's sidebar, pages only navigate
 *    to immediately adjacent link siblings in the same parent group.
 *    If the immediate previous sibling is a group or absent → disable prev.
 *    If the immediate next sibling is a group or absent → disable next.
 *
 * 2. Splash page rules — support, root/locale index pages, aspireconf pages,
 *    and 404 never show prev/next navigation.
 *
 * 3. Frontmatter overrides — explicit `{ link, label }` or `false` values in
 *    frontmatter always take precedence over implicit rules.
 *
 * Runs after the starlight-sidebar-topics plugin (order 'default' vs 'pre').
 */
export const onRequest = defineRouteMiddleware((context) => {
  const routeData = context.locals.starlightRoute;
  if (!routeData) return;

  const { entry, pagination, sidebar } = routeData;

  // --- Step 0: Canonicalize API reference sidebar links ---
  // API reference pages under /reference/api/ are only generated for the default
  // (English) locale because they're produced from package metadata rather than
  // translated content. Starlight auto-prefixes the active locale to sidebar
  // links, which produces 404s for non-default locales (e.g.
  // /it/reference/api/csharp/). Rewrite those hrefs to point to the canonical
  // English path so the sidebar never emits a link that 404s.
  canonicalizeApiReferenceLinks(sidebar);

  // --- Step 0.5: Optimize Open Graph metadata in the emitted head ---
  // Starlight populates `head` with `og:title` from `data.title` and
  // `og:description` from `data.description`. We compose an SEO-optimal
  // title (via `seoTitle` or the `· Aspire` suffix) and trim the
  // description to the 200-char Open Graph limit so social previews never
  // see the raw, sometimes-too-long frontmatter strings.
  optimizeOpenGraphHead(routeData, context.url, context.site);

  // --- Step 1: Group boundary rules ---
  const location = findCurrentPage(sidebar);
  if (location) {
    const { siblings, index } = location;
    const prevSibling = index > 0 ? siblings[index - 1] : undefined;
    const nextSibling = index < siblings.length - 1 ? siblings[index + 1] : undefined;

    if (!prevSibling || prevSibling.type !== 'link') {
      pagination.prev = undefined;
    }
    if (!nextSibling || nextSibling.type !== 'link') {
      pagination.next = undefined;
    }
  }

  // --- Step 2: Splash page rules ---
  if (isSplashPage(entry.id)) {
    pagination.prev = undefined;
    pagination.next = undefined;
  }

  // --- Step 3: Frontmatter overrides (highest priority) ---
  const prevConfig = entry.data.prev;
  const nextConfig = entry.data.next;

  if (prevConfig === false) {
    pagination.prev = undefined;
  } else if (isExplicitLink(prevConfig)) {
    pagination.prev = {
      type: 'link',
      label: prevConfig.label,
      href: prevConfig.link,
      isCurrent: false,
      badge: undefined,
      attrs: {},
    };
  }

  if (nextConfig === false) {
    pagination.next = undefined;
  } else if (isExplicitLink(nextConfig)) {
    pagination.next = {
      type: 'link',
      label: nextConfig.label,
      href: nextConfig.link,
      isCurrent: false,
      badge: undefined,
      attrs: {},
    };
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MetaHeadEntry {
  tag: string;
  attrs?: Record<string, string | boolean | undefined>;
  content?: string;
}

/**
 * Replace the `og:title` / `og:description` meta entries Starlight emits by
 * default with our SEO-optimized values from `getOgMetadata`. The function
 * mutates `routeData.head` in place so downstream components (the
 * Starlight `<Head>` default and our wrapper) emit a single, consistent set
 * of Open Graph tags.
 *
 * Idempotent: callers can invoke it more than once per request without
 * accumulating duplicate entries.
 */
function optimizeOpenGraphHead(
  routeData: Parameters<Parameters<typeof defineRouteMiddleware>[0]>[0]['locals']['starlightRoute'],
  url: URL,
  site: URL | string | undefined
): void {
  const head = routeData.head as MetaHeadEntry[];
  if (!Array.isArray(head)) return;

  const og = getOgMetadata(routeData, url, site);

  upsertMetaEntry(head, 'property', 'og:title', og.ogTitle);
  upsertMetaEntry(head, 'property', 'og:description', og.description);
}

/**
 * Replace (or insert) a `<meta>` entry in the Starlight head array. Matches
 * on the `property`/`name` attribute so `og:*` and `name="…"` tags can both
 * be addressed.
 */
function upsertMetaEntry(
  head: MetaHeadEntry[],
  attribute: 'property' | 'name',
  attributeValue: string,
  content: string
): void {
  const existing = head.find(
    (entry) => entry.tag === 'meta' && entry.attrs?.[attribute] === attributeValue
  );

  if (existing) {
    existing.attrs = { ...existing.attrs, content };
    return;
  }

  head.push({
    tag: 'meta',
    attrs: { [attribute]: attributeValue, content },
  });
}

interface SidebarEntry {
  type: string;
  label: string;
  href?: string;
  isCurrent?: boolean;
  entries?: SidebarEntry[];
}

/**
 * Walk the sidebar tree and rewrite any link whose href is a localized API
 * reference path (e.g. `/it/reference/api/csharp/`) to the canonical,
 * locale-stripped path (e.g. `/reference/api/csharp/`).
 */
function canonicalizeApiReferenceLinks(entries: SidebarEntry[]): void {
  for (const entry of entries) {
    if (!entry) continue;

    if (entry.type === 'link' && typeof entry.href === 'string') {
      const canonical = stripApiReferenceLocale(entry.href);
      if (canonical) {
        entry.href = canonical;
      }
    }

    if (entry.entries) {
      canonicalizeApiReferenceLinks(entry.entries);
    }
  }
}

/**
 * Recursively find the current page (`isCurrent === true`) in the sidebar tree
 * and return its sibling entries along with its index within them.
 */
function findCurrentPage(
  entries: SidebarEntry[]
): { siblings: SidebarEntry[]; index: number } | undefined {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }

    if (entry.type === 'link' && entry.isCurrent) {
      return { siblings: entries, index: i };
    }
    if (entry.type === 'group' && entry.entries) {
      const result = findCurrentPage(entry.entries);
      if (result) return result;
    }
  }
  return undefined;
}

/**
 * Identify pages that should never display prev/next navigation:
 * root/locale index pages, aspireconf, support, and 404.
 */
function isSplashPage(id: string): boolean {
  const normalized = id.replace(/\\/g, '/');
  // Root and locale index pages (index.mdx, da/index.mdx, zh-cn/index.mdx …)
  if (/^([a-z]{2}(-[a-z]{2,4})?\/)?index\.mdx?$/i.test(normalized)) return true;
  // Aspire conf pages
  if (/aspireconf/i.test(normalized)) return true;
  // Support page (any locale)
  if (/^([a-z]{2}(-[a-z]{2,4})?\/)?support\.mdx?$/i.test(normalized)) return true;
  // 404 page
  if (/^([a-z]{2}(-[a-z]{2,4})?\/)?404\.mdx?$/i.test(normalized)) return true;
  return false;
}

/** Check whether a frontmatter prev/next value is an explicit link override. */
function isExplicitLink(config: unknown): config is { link: string; label: string } {
  return (
    typeof config === 'object' &&
    config !== null &&
    'link' in config &&
    'label' in config &&
    typeof (config as Record<string, unknown>).link === 'string' &&
    typeof (config as Record<string, unknown>).label === 'string'
  );
}
