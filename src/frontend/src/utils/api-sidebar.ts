/* ------------------------------------------------------------------ */
/*  Build sidebar configuration for API reference pages.              */
/*                                                                    */
/*  Returns the Starlight user-config sidebar format so it can be     */
/*  passed as the `sidebar` prop to `<StarlightPage>`.                */
/* ------------------------------------------------------------------ */

import {
  type PackageApiDocument,
  type PackageCollectionEntry,
  type PackageMember,
  type PackageType,
  slugify,
  genericArity,
  typeDisplayName,
  packageSlug,
  groupTypesByNamespace,
  memberKindOrder,
  memberKindLabels,
  memberKindSlugs,
  getPackages,
} from './packages';

/** Member kinds that get their own sidebar sub-item under a type. */
const sidebarMemberKinds = memberKindOrder;
interface SidebarLinkItem {
  label: string;
  link: string;
}

interface SidebarGroupItem {
  label: string;
  collapsed: boolean;
  items: SidebarItem[];
}

type SidebarItem = SidebarLinkItem | SidebarGroupItem;

const apiSidebarCache = new Map<string, Promise<SidebarItem[]>>();
const shouldCacheApiSidebar = import.meta.env.PROD;

interface ApiSidebarOptions {
  packageName?: string;
}

/**
 * Determine whether a type is a simple marker interface (no members at all).
 * Marker interfaces get a flat link instead of a nested group.
 */
function isMarkerInterface(type: PackageType): boolean {
  if (type.kind !== 'interface') return false;
  const memberCount = type.members?.length ?? 0;
  const enumMemberCount = type.enumMembers?.length ?? 0;
  return memberCount === 0 && enumMemberCount === 0;
}

/**
 * Build sidebar sub-items for a single type.
 * Returns an array of { label, link } entries for each member-kind group
 * that has at least one member (e.g. Constructors, Properties, Methods).
 */
function buildTypeSidebarItems(packageName: string, type: PackageType): SidebarLinkItem[] {
  const base = `/reference/api/csharp/${packageSlug(packageName)}/${slugify(type.name, genericArity(type))}`;
  const items: SidebarLinkItem[] = [{ label: 'Overview', link: `${base}/` }];

  const members: PackageMember[] = type.members ?? [];
  const memberKindsPresent = new Set<string>();
  for (const member of members) {
    if (member.kind) {
      memberKindsPresent.add(member.kind);
    }
  }

  for (const kind of sidebarMemberKinds) {
    if (memberKindsPresent.has(kind)) {
      items.push({
        label: memberKindLabels[kind] ?? kind,
        link: `${base}/${memberKindSlugs[kind] ?? kind}/`,
      });
    }
  }

  return items;
}

/**
 * Build the sidebar group for a single C# package.
 */
function buildPackageSidebarEntry(
  pkg: PackageApiDocument,
  collapsed: boolean = true
): SidebarGroupItem {
  const validTypes = pkg.types.filter((t) => t.name.length > 0);
  const nsGroups = groupTypesByNamespace(validTypes);

  // If only one namespace, skip the namespace nesting level
  const hasMultipleNamespaces = nsGroups.size > 1;

  const typeItems = hasMultipleNamespaces
    ? [...nsGroups.entries()].map(([ns, types]) => ({
        label: ns,
        collapsed: true,
        items: types.map((t) => buildTypeSidebarEntry(pkg.package.name, t)),
      }))
    : [...nsGroups.values()].flat().map((t) => buildTypeSidebarEntry(pkg.package.name, t));

  return {
    label: pkg.package.name,
    collapsed,
    items: [
      { label: 'Overview', link: `/reference/api/csharp/${packageSlug(pkg.package.name)}/` },
      ...typeItems,
    ],
  };
}

async function buildApiReferenceSidebar(options: ApiSidebarOptions = {}) {
  const packages = await getPackages();
  const sidebarRoot = { label: 'Search APIs', link: '/reference/api/csharp/' };

  if (options.packageName) {
    const currentPackage = packages.find(
      (pkg: PackageCollectionEntry) => pkg.data.package.name === options.packageName
    )?.data;
    return currentPackage
      ? [sidebarRoot, buildPackageSidebarEntry(currentPackage, false)]
      : [sidebarRoot];
  }

  const sorted = packages
    .map((p) => p.data)
    .sort((a, b) => a.package.name.localeCompare(b.package.name));

  return [sidebarRoot, ...sorted.map((pkg) => buildPackageSidebarEntry(pkg))];
}

/**
 * Generate a sidebar configuration array for API reference pages.
 * Results are memoized so repeated page renders do not rebuild the same tree.
 */
export function getApiReferenceSidebar(options: ApiSidebarOptions = {}) {
  if (!shouldCacheApiSidebar) {
    return buildApiReferenceSidebar(options);
  }

  const cacheKey = options.packageName ? `package:${options.packageName}` : 'all';
  const cachedSidebar = apiSidebarCache.get(cacheKey);
  if (cachedSidebar) {
    return cachedSidebar;
  }

  const sidebar = buildApiReferenceSidebar(options);
  apiSidebarCache.set(cacheKey, sidebar);
  return sidebar;
}

/** Build a single sidebar entry for a type (flat link or nested group). */
function buildTypeSidebarEntry(packageName: string, t: PackageType): SidebarItem {
  const label = typeDisplayName(t);
  if (isMarkerInterface(t)) {
    return {
      label,
      link: `/reference/api/csharp/${packageSlug(packageName)}/${slugify(t.name, genericArity(t))}/`,
    };
  }
  return {
    label,
    collapsed: true,
    items: buildTypeSidebarItems(packageName, t),
  };
}
