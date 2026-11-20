/* ------------------------------------------------------------------ */
/*  Build sidebar configuration for TypeScript API reference pages.    */
/* ------------------------------------------------------------------ */

import { tsModuleSlug, getTsModules } from './ts-modules';
import { getTsItemSlug, getTsStandaloneFunctions, getTsTopLevelRouteItems, type TsApiDocumentRouteLike } from './ts-api-routes';
import type { CompactSidebarNode } from './api-sidebar';

/**
 * Serialize a module's full catalog (grouped like the module overview) for the
 * client-side loader. Hrefs are relative to the module root.
 * Emitted once per module by `[module]/sidebar.json.ts`.
 */
export function buildCompactTsModuleSidebarTree(doc: TsApiDocumentRouteLike): CompactSidebarNode[] {
  const all = getTsTopLevelRouteItems(doc);
  const group = (label: string, items: TsApiDocumentRouteLike['functions']): CompactSidebarNode[] => {
    const nodes = (items ?? [])
      .map((item): CompactSidebarNode => [item.name, `${getTsItemSlug(item, all)}/`])
      .filter(([, href]) => href !== '/')
      .sort(([a], [b]) => a.localeCompare(b));
    return nodes.length > 0 ? [[label, nodes]] : [];
  };
  return [
    ['Overview', ''],
    ...group('Types', [...(doc.handleTypes ?? []), ...(doc.dtoTypes ?? [])]),
    ...group('Functions', getTsStandaloneFunctions(doc)),
    ...group('Enums', doc.enumTypes),
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

let tsApiSidebarPromise: Promise<SidebarItem[]> | undefined;
const shouldCacheTsApiSidebar = import.meta.env.PROD;

interface SidebarPage {
  name: string;
  slug: string;
}

type TsApiSidebarOptions = {
  packageName: string;
  headings: readonly { slug: string; text: string }[];
} & (
  | { item?: never; member?: never }
  | { item: SidebarPage; member?: SidebarPage }
);

function buildModuleSidebarEntry(options: TsApiSidebarOptions): SidebarGroupItem {
  const modulePath = `/reference/api/typescript/${tsModuleSlug(options.packageName)}/`;
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

async function buildTsApiReferenceSidebar(options?: TsApiSidebarOptions) {
  const sidebarRoot = { label: 'Search TypeScript APIs', link: '/reference/api/typescript/' };

  if (options) {
    return [sidebarRoot, buildModuleSidebarEntry(options)];
  }

  const modules = await getTsModules();
  const sorted = modules
    .map((p) => p.data)
    .sort((a, b) => a.package.name.localeCompare(b.package.name));

  return [sidebarRoot, ...sorted.map((mod) => ({
    label: mod.package.name,
    link: `/reference/api/typescript/${tsModuleSlug(mod.package.name)}/`,
  }))];
}

export function getTsApiReferenceSidebar(options?: TsApiSidebarOptions) {
  // Only the shared module index needs caching, not thousands of tiny page trees.
  if (options || !shouldCacheTsApiSidebar) {
    return buildTsApiReferenceSidebar(options);
  }

  tsApiSidebarPromise ??= buildTsApiReferenceSidebar();
  return tsApiSidebarPromise;
}
