/* ------------------------------------------------------------------ */
/*  Build sidebar configuration for Go API reference pages.            */
/* ------------------------------------------------------------------ */

import { goModuleSlug, getGoModules } from './go-modules';
import { getGoItemSlug, getGoStandaloneFunctions, getGoTopLevelRouteItems, type GoApiDocumentRouteLike } from './go-api-routes';
import type { CompactSidebarNode } from './api-sidebar';

/**
 * Serialize a module's full catalog (grouped like the module overview) for the
 * client-side loader. Hrefs are relative to the module root.
 * Emitted once per module by `[module]/sidebar.json.ts`.
 */
export function buildCompactGoModuleSidebarTree(doc: GoApiDocumentRouteLike): CompactSidebarNode[] {
  const all = getGoTopLevelRouteItems(doc);
  const group = (label: string, items: GoApiDocumentRouteLike['functions']): CompactSidebarNode[] => {
    const nodes = (items ?? [])
      .map((item): CompactSidebarNode => [item.name, `${getGoItemSlug(item, all)}/`])
      .filter(([, href]) => href !== '/')
      .sort(([a], [b]) => a.localeCompare(b));
    return nodes.length > 0 ? [[label, nodes]] : [];
  };
  return [
    ['Overview', ''],
    ...group('Handles', doc.handleTypes),
    ...group('DTOs', doc.dtoTypes),
    ...group('Enums', doc.enumTypes),
    ...group('Functions', getGoStandaloneFunctions(doc)),
  ];
}

interface SidebarLinkItem {
  label: string;
  link: string;
}

interface SidebarGroupItem {
  label: string;
  collapsed: boolean;
  items: Array<SidebarLinkItem | SidebarGroupItem>;
}

type SidebarItem = SidebarLinkItem | SidebarGroupItem;

let goApiSidebarPromise: Promise<SidebarItem[]> | undefined;
const shouldCacheGoApiSidebar = import.meta.env.PROD;

interface SidebarPage {
  name: string;
  slug: string;
}

type GoApiSidebarOptions = {
  packageName: string;
  headings: readonly { slug: string; text: string }[];
} & (
  | { item?: never; member?: never }
  | { item: SidebarPage; member?: SidebarPage }
);

function buildModuleSidebarEntry(options: GoApiSidebarOptions): SidebarGroupItem {
  const modulePath = `/reference/api/go/${goModuleSlug(options.packageName)}/`;
  const items: SidebarItem[] = [{ label: 'Overview', link: modulePath }];
  let currentItems = items;
  let currentPath = modulePath;

  for (const page of [options.item, options.member]) {
    if (!page) continue;
    currentPath += `${page.slug}/`;
    const pageItems: SidebarItem[] = [{ label: 'Overview', link: currentPath }];
    currentItems.push({
      label: page.name,
      collapsed: false,
      items: pageItems,
    });
    currentItems = pageItems;
  }

  // Each page renders only this spine; the full catalog is emitted once per module
  // (\[module]/sidebar.json\) and swapped in on the client. Section links reuse the page's headings.
  currentItems.push(...options.headings.map(({ slug, text }) => ({
    label: text,
    link: `${currentPath}#${slug}`,
  })));

  return {
    label: options.packageName,
    collapsed: false,
    items,
  };
}

async function buildGoApiReferenceSidebar(options?: GoApiSidebarOptions) {
  const sidebarRoot = { label: 'Search Go APIs', link: '/reference/api/go/' };

  if (options) {
    return [sidebarRoot, buildModuleSidebarEntry(options)];
  }

  const modules = await getGoModules();
  const sorted = modules
    .map((p) => p.data)
    .sort((a, b) => a.package.name.localeCompare(b.package.name));

  return [sidebarRoot, ...sorted.map((mod) => ({
    label: mod.package.name,
    link: `/reference/api/go/${goModuleSlug(mod.package.name)}/`,
  }))];
}

export function getGoApiReferenceSidebar(options?: GoApiSidebarOptions) {
  // Only the shared module index needs caching, not thousands of tiny page trees.
  if (options || !shouldCacheGoApiSidebar) {
    return buildGoApiReferenceSidebar(options);
  }

  goApiSidebarPromise ??= buildGoApiReferenceSidebar();
  return goApiSidebarPromise;
}
