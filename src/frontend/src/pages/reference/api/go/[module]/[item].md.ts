import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderGoItemMarkdown } from '@utils/go-api-markdown';
import type { GoApiDocument, GoDtoType, GoEnumType, GoFunction, GoHandleType } from '@utils/go-modules';
import { getGoModules, goModuleSlug } from '@utils/go-modules';
import { getGoItemSlug, getGoStandaloneFunctions, getGoTopLevelRouteItems } from '@utils/go-api-routes';

export const prerender = true;

type GoItemKind = 'handle' | 'dto' | 'enum' | 'function';
type GoItem = GoHandleType | GoDtoType | GoEnumType | GoFunction;

type RouteProps = {
  item: GoItem;
  itemKind: GoItemKind;
  pkg: GoApiDocument;
};

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
    const routeItems: Array<{ item: GoItem; itemKind: GoItemKind }> = [
      ...(pkg.handleTypes ?? []).map((item) => ({ item, itemKind: 'handle' as const })),
      ...(pkg.dtoTypes ?? []).map((item) => ({ item, itemKind: 'dto' as const })),
      ...(pkg.enumTypes ?? []).map((item) => ({ item, itemKind: 'enum' as const })),
      ...getGoStandaloneFunctions(pkg).map((item) => ({ item, itemKind: 'function' as const })),
    ];

    for (const { item, itemKind } of routeItems) {
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
          item,
          itemKind,
          pkg,
        },
      });
    }
  }

  return paths;
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;

  return markdownResponse(renderGoItemMarkdown(routeProps.pkg, routeProps.item, routeProps.itemKind, base));
};
