/* ------------------------------------------------------------------ */
/*  Build sidebar configuration for Go API reference pages.            */
/* ------------------------------------------------------------------ */

import { goModuleSlug, getGoModules } from './go-modules';

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

  // The catalog lives on the module overview; other pages link to it rather
  // than embedding its full tree again. Section links reuse the page's headings.
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
