import type { PackageApiDocument, PackageType } from './packages';
import type { TsApiDocument, TsDtoType, TsEnumType, TsFunction, TsHandleType } from './ts-modules';
import { genericArity, memberKindOrder, memberKindSlugs, packageSlug, slugify } from './csharp-route-identity';
import { getTsItemSlug, getTsMethods, getTsMethodSlug, getTsStandaloneFunctions, getTsTopLevelRouteItems, tsSlugify } from './ts-api-routes';

export interface ApiRoute {
  html: string | null;
  markdown: string;
}

export interface CSharpRouteProps {
  pkg: PackageApiDocument;
  allTypes: PackageType[];
  type?: PackageType;
  kind?: string;
  memberKind?: string;
}

export interface TypeScriptRouteProps {
  pkg: TsApiDocument;
  item?: TsHandleType | TsDtoType | TsEnumType | TsFunction;
  itemKind?: 'handle' | 'dto' | 'enum' | 'function';
  parentType?: TsHandleType;
  method?: TsFunction;
}

interface RouteEntry<T> extends ApiRoute {
  props: T;
}

function entry<T>(path: string, props: T): RouteEntry<T> {
  return { html: `${path}/`, markdown: `${path}.md`, props };
}

export function getCSharpRouteEntries(pkg: PackageApiDocument): RouteEntry<CSharpRouteProps>[] {
  const root = `/reference/api/csharp/${packageSlug(pkg.package.name)}`;
  const props = { pkg, allTypes: pkg.types };
  const routes: RouteEntry<CSharpRouteProps>[] = [entry(root, props)];
  for (const type of pkg.types) {
    const slug = slugify(type.name, genericArity(type));
    if (!slug) continue;
    const path = `${root}/${slug}`;
    routes.push(entry(path, { ...props, type }));
    for (const kind of memberKindOrder) {
      if (type.members?.some((member) => member.kind === kind)) {
        routes.push(entry(`${path}/${memberKindSlugs[kind]}`, {
          ...props, type, kind, memberKind: kind,
        }));
      }
    }
  }
  return routes;
}

export function getTypeScriptRouteEntries(pkg: TsApiDocument): RouteEntry<TypeScriptRouteProps>[] {
  const root = `/reference/api/typescript/${packageSlug(pkg.package.name)}`;
  const routes: RouteEntry<TypeScriptRouteProps>[] = [entry(root, { pkg })];
  const items = getTsTopLevelRouteItems(pkg);
  const groups = [
    { kind: 'handle' as const, items: pkg.handleTypes ?? [] },
    { kind: 'dto' as const, items: pkg.dtoTypes ?? [] },
    { kind: 'enum' as const, items: pkg.enumTypes ?? [] },
    { kind: 'function' as const, items: getTsStandaloneFunctions(pkg) },
  ];
  for (const group of groups) {
    for (const item of group.items) {
      const slug = getTsItemSlug(item, items);
      if (slug) routes.push(entry(`${root}/${slug}`, { pkg, item, itemKind: group.kind }));
    }
  }
  for (const handle of pkg.handleTypes ?? []) {
    const item = getTsItemSlug(handle, items);
    if (!item) continue;
    const methods = getTsMethods(handle);
    for (const method of methods) {
      const member = getTsMethodSlug(method, methods, handle.name);
      if (member) routes.push(entry(`${root}/${item}/${member}`, { pkg, parentType: handle, method }));
    }
  }

  // Published Markdown aliases resolve to the last source entry, but never replace a canonical URL.
  const canonical = new Set(routes.map((route) => route.markdown));
  const aliases = new Map<string, RouteEntry<TypeScriptRouteProps>>();
  for (const route of routes) {
    const { item, parentType, method } = route.props;
    const segments = item ? [tsSlugify(item.name)]
      : parentType && method ? [tsSlugify(parentType.name), tsSlugify(method.name)] : [];
    if (!segments.length || segments.some((segment) => !segment)) continue;
    const markdown = `${root}/${segments.join('/')}.md`;
    if (!canonical.has(markdown)) aliases.set(markdown, { ...route, html: null, markdown });
  }
  return [...routes, ...aliases.values()];
}

export function buildApiRouteCatalog(packages: PackageApiDocument[], modules: TsApiDocument[]): ApiRoute[] {
  // The two landing pages are the heaviest pages (about 0.5 s and 2.7 MB each) and the most visited,
  // so they stay prerendered; only the per-package, type and member pages are rendered on demand.
  const routes: ApiRoute[] = [];
  for (const pkg of packages) {
    if (pkg.types.length) routes.push(...getCSharpRouteEntries(pkg));
  }
  for (const pkg of modules) routes.push(...getTypeScriptRouteEntries(pkg));
  const unique = new Map<string, ApiRoute>();
  for (const { html, markdown } of routes) unique.set(markdown, { html, markdown });
  return [...unique.values()];
}
