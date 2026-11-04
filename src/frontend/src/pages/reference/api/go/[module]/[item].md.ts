import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderGoItemMarkdown } from '@utils/go-api-markdown';
import type { GoItem, GoItemKind, GoItemRouteProps } from '@utils/go-modules';
import { getGoItem, getGoModuleDocument, getGoModules, goModuleSlug } from '@utils/go-modules';
import { getGoItemSlug, getGoStandaloneFunctions, getGoTopLevelRouteItems } from '@utils/go-api-routes';

export const prerender = true;

type RouteProps = GoItemRouteProps;

type StaticPath = {
  params: { item: string; module: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getGoModules();
  const paths: StaticPath[] = [];

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = goModuleSlug(pkg.package.name);
    const items = getGoTopLevelRouteItems(pkg);
    const routeItems: Array<{ item: GoItem; itemKind: GoItemKind; itemIndex: number }> = [
      ...(pkg.handleTypes ?? []).map((item, itemIndex) => ({ item, itemKind: 'handle' as const, itemIndex })),
      ...(pkg.dtoTypes ?? []).map((item, itemIndex) => ({ item, itemKind: 'dto' as const, itemIndex })),
      ...(pkg.enumTypes ?? []).map((item, itemIndex) => ({ item, itemKind: 'enum' as const, itemIndex })),
      ...getGoStandaloneFunctions(pkg).map((item, itemIndex) => ({ item, itemKind: 'function' as const, itemIndex })),
    ];

    for (const { item, itemKind, itemIndex } of routeItems) {
      const itemSlug = getGoItemSlug(item, items);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          itemIndex,
          itemKind,
          packageName: pkg.package.name,
        },
      });
    }
  }

  return paths;
}

export const GET: APIRoute = async ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;

  const pkg = await getGoModuleDocument(routeProps.packageName);
  const item = getGoItem(pkg, routeProps.itemKind, routeProps.itemIndex);
  return markdownResponse(renderGoItemMarkdown(pkg, item, routeProps.itemKind, base));
};
