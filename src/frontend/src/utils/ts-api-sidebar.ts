/* ------------------------------------------------------------------ */
/*  Build sidebar configuration for TypeScript API reference pages.    */
/* ------------------------------------------------------------------ */

import {
  type TsApiDocument,
  type TsFunction,
  type TsModuleCollectionEntry,
  type TsNamedItem,
  tsModuleSlug,
  tsSlugify,
  getTsModules,
} from './ts-modules';

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

const tsApiSidebarCache = new Map<string, Promise<SidebarItem[]>>();
const shouldCacheTsApiSidebar = import.meta.env.PROD;

interface TsApiSidebarOptions {
  packageName?: string;
}

function buildModuleSidebarEntry(mod: TsApiDocument, collapsed: boolean = true): SidebarGroupItem {
  const modSlug = tsModuleSlug(mod.package.name);
  const items: SidebarItem[] = [
    { label: 'Overview', link: `/reference/api/typescript/${modSlug}/` },
  ];

  // Types (handles + DTOs merged into one group)
  const allTypes: TsNamedItem[] = [];
  for (const type of mod.handleTypes ?? []) {
    if (type.name) {
      allTypes.push(type);
    }
  }
  for (const type of mod.dtoTypes ?? []) {
    if (type.name) {
      allTypes.push(type);
    }
  }
  allTypes.sort((a, b) => a.name.localeCompare(b.name));

  if (allTypes.length > 0) {
    items.push({
      label: 'Types',
      collapsed: true,
      items: allTypes.map((t) => ({
        label: t.name,
        link: `/reference/api/typescript/${modSlug}/${tsSlugify(t.name)}/`,
      })),
    });
  }

  // Functions — individual pages
  const functions = (mod.functions ?? []).filter(
    (f: TsFunction) => f.name && (!f.qualifiedName || !f.qualifiedName.includes('.'))
  );
  if (functions.length > 0) {
    items.push({
      label: 'Functions',
      collapsed: true,
      items: functions
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({
          label: f.name,
          link: `/reference/api/typescript/${modSlug}/${tsSlugify(f.name)}/`,
        })),
    });
  }

  // Enum types
  const enums = (mod.enumTypes ?? []).filter((t) => t.name);
  if (enums.length > 0) {
    items.push({
      label: 'Enums',
      collapsed: true,
      items: enums
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({
          label: e.name,
          link: `/reference/api/typescript/${modSlug}/${tsSlugify(e.name)}/`,
        })),
    });
  }

  return {
    label: mod.package.name,
    collapsed,
    items,
  };
}

/**
 * Generate a sidebar configuration array for TypeScript API reference pages.
 * Each module becomes a collapsible group. Within each module, items are
 * organized by type: handle types, functions, DTOs, and enums.
 */
async function buildTsApiReferenceSidebar(options: TsApiSidebarOptions = {}) {
  const modules = await getTsModules();
  const sidebarRoot = { label: 'Search TypeScript APIs', link: '/reference/api/typescript/' };

  if (options.packageName) {
    const currentModule = modules.find(
      (mod: TsModuleCollectionEntry) => mod.data.package.name === options.packageName
    )?.data;
    return currentModule
      ? [sidebarRoot, buildModuleSidebarEntry(currentModule, false)]
      : [sidebarRoot];
  }

  const sorted = modules
    .map((p) => p.data)
    .sort((a, b) => a.package.name.localeCompare(b.package.name));

  return [sidebarRoot, ...sorted.map((mod) => buildModuleSidebarEntry(mod))];
}

export function getTsApiReferenceSidebar(options: TsApiSidebarOptions = {}) {
  if (!shouldCacheTsApiSidebar) {
    return buildTsApiReferenceSidebar(options);
  }

  const cacheKey = options.packageName ? `package:${options.packageName}` : 'all';
  const cachedSidebar = tsApiSidebarCache.get(cacheKey);
  if (cachedSidebar) {
    return cachedSidebar;
  }

  const sidebar = buildTsApiReferenceSidebar(options);
  tsApiSidebarCache.set(cacheKey, sidebar);
  return sidebar;
}
