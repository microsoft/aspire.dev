import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

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

  // --- Step 1: Group boundary rules ---
  const location = findCurrentPage(sidebar as SidebarEntry[]);
  if (location) {
    const { siblings, index } = location;
    const prevSibling = index > 0 ? siblings[index - 1] : undefined;
    const nextSibling =
      index < siblings.length - 1 ? siblings[index + 1] : undefined;

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

interface SidebarEntry {
  type: string;
  label: string;
  isCurrent?: boolean;
  entries?: SidebarEntry[];
}

/**
 * Recursively find the current page (`isCurrent === true`) in the sidebar tree
 * and return its sibling entries along with its index within them.
 */
function findCurrentPage(
  entries: SidebarEntry[],
): { siblings: SidebarEntry[]; index: number } | undefined {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
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
function isExplicitLink(
  config: unknown,
): config is { link: string; label: string } {
  return (
    typeof config === 'object' &&
    config !== null &&
    'link' in config &&
    'label' in config &&
    typeof (config as Record<string, unknown>).link === 'string' &&
    typeof (config as Record<string, unknown>).label === 'string'
  );
}
