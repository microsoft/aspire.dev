/* ------------------------------------------------------------------ */
/*  Build sidebar configuration for C# API reference pages.           */
/*                                                                    */
/*  Each page renders a small "spine" (search link, package overview, */
/*  and the current type with its member-kind links). The full        */
/*  package tree is emitted once per package as a compact JSON tree   */
/*  (see `[package]/sidebar.json.ts`) and swapped in on the client.   */
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

/**
 * Compact, lossless form of a package sidebar tree: a link is `[label, href]`
 * and a group is `[label, children]`. Hrefs are relative to the package root.
 */
export type CompactSidebarNode = [label: string, hrefOrChildren: string | CompactSidebarNode[]];

let apiSidebarIndexPromise: Promise<SidebarItem[]> | undefined;
const shouldCacheApiSidebar = import.meta.env.PROD;

interface ApiSidebarOptions {
  packageName?: string;
  /** The type whose member-kind links should be shown on this page. */
  type?: PackageType;
}

function packagePath(packageName: string): string {
  return `/reference/api/csharp/${packageSlug(packageName)}/`;
}

/** URL of the static full-tree payload for a package. */
export function apiSidebarTreeHref(packageName: string): string {
  return `${packagePath(packageName)}sidebar.json`;
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
  const base = `${packagePath(packageName)}${slugify(type.name, genericArity(type))}`;
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

/** Build a single sidebar entry for a type (flat link or nested group). */
function buildTypeSidebarEntry(
  packageName: string,
  t: PackageType,
  collapsed: boolean = true
): SidebarItem {
  const label = typeDisplayName(t);
  if (isMarkerInterface(t)) {
    return {
      label,
      link: `${packagePath(packageName)}${slugify(t.name, genericArity(t))}/`,
    };
  }
  return {
    label,
    collapsed,
    items: buildTypeSidebarItems(packageName, t),
  };
}

/**
 * Build every entry under a package group: its overview link followed by all
 * types, nested under their namespaces when the package has more than one.
 */
export function buildPackageSidebarItems(pkg: PackageApiDocument): SidebarItem[] {
  const validTypes = pkg.types.filter((t) => t.name.length > 0);
  const nsGroups = groupTypesByNamespace(validTypes);
  const typeItems: SidebarItem[] =
    nsGroups.size > 1
      ? [...nsGroups.entries()].map(([ns, types]) => ({
          label: ns,
          collapsed: true,
          items: types.map((t) => buildTypeSidebarEntry(pkg.package.name, t)),
        }))
      : [...nsGroups.values()].flat().map((t) => buildTypeSidebarEntry(pkg.package.name, t));

  return [{ label: 'Overview', link: packagePath(pkg.package.name) }, ...typeItems];
}

/**
 * Build the per-page spine for a package: its overview link and, on type and
 * member-kind pages, the current type (under its namespace when the full tree
 * nests by namespace) so the page's own navigation is server-rendered.
 */
function buildPackageSpine(pkg: PackageApiDocument, type?: PackageType): SidebarGroupItem {
  const items: SidebarItem[] = [{ label: 'Overview', link: packagePath(pkg.package.name) }];

  if (type && type.name.length > 0) {
    const typeEntry = buildTypeSidebarEntry(pkg.package.name, type, false);
    const namespaces = new Set(
      pkg.types.filter((t) => t.name.length > 0).map((t) => t.namespace || '(global)')
    );
    items.push(
      namespaces.size > 1
        ? { label: type.namespace || '(global)', collapsed: false, items: [typeEntry] }
        : typeEntry
    );
  }

  return { label: pkg.package.name, collapsed: false, items };
}

function toCompactNode(item: SidebarItem, base: string): CompactSidebarNode {
  if ('link' in item) {
    return [item.label, item.link.startsWith(base) ? item.link.slice(base.length) : item.link];
  }
  return [item.label, item.items.map((child) => toCompactNode(child, base))];
}

/** Serialize a package's full sidebar tree for the client-side loader. */
export function buildCompactPackageSidebarTree(pkg: PackageApiDocument): CompactSidebarNode[] {
  const base = packagePath(pkg.package.name);
  return buildPackageSidebarItems(pkg).map((item) => toCompactNode(item, base));
}

async function buildApiReferenceSidebar(options: ApiSidebarOptions = {}): Promise<SidebarItem[]> {
  const packages = await getPackages();
  const sidebarRoot = { label: 'Search APIs', link: '/reference/api/csharp/' };

  if (options.packageName) {
    const currentPackage = packages.find(
      (pkg: PackageCollectionEntry) => pkg.data.package.name === options.packageName
    )?.data;
    return currentPackage
      ? [sidebarRoot, buildPackageSpine(currentPackage, options.type)]
      : [sidebarRoot];
  }

  // The landing page links to each package rather than embedding every tree.
  const sorted = packages
    .map((p) => p.data)
    .sort((a, b) => a.package.name.localeCompare(b.package.name));

  return [
    sidebarRoot,
    ...sorted.map((pkg) => ({ label: pkg.package.name, link: packagePath(pkg.package.name) })),
  ];
}

/**
 * Generate a sidebar configuration array for API reference pages.
 * Only the shared landing index is memoized; per-page spines are tiny.
 */
export function getApiReferenceSidebar(options: ApiSidebarOptions = {}) {
  if (options.packageName || !shouldCacheApiSidebar) {
    return buildApiReferenceSidebar(options);
  }

  apiSidebarIndexPromise ??= buildApiReferenceSidebar();
  return apiSidebarIndexPromise;
}