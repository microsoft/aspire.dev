import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { withApiCacheKeys } from '@utils/api-cache-key';
import { renderTypeScriptItemMarkdown } from '@utils/typescript-api-markdown';
import type { TsItem, TsItemKind, TsItemRouteProps } from '@utils/ts-modules';
import { getTsModuleDocument, getTsModules, tsModuleSlug, tsSlugify } from '@utils/ts-modules';
import { getTsItemSlug, getTsRouteItem, getTsStandaloneFunctions, getTsTopLevelRouteItems } from '@utils/ts-api-routes';

export const prerender = true;

type RouteProps = TsItemRouteProps;

type StaticPath = {
  params: { item: string; module: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<Array<StaticPath & { cacheKey: string }>> {
  const packages = await getTsModules();
  const paths: StaticPath[] = [];
  const names = new Map<StaticPath, string>();

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = tsModuleSlug(pkg.package.name);
    const items = getTsTopLevelRouteItems(pkg);

    const routeItems: Array<{ item: TsItem; itemKind: TsItemKind; itemIndex: number }> = [
      ...(pkg.handleTypes ?? []).map((item, itemIndex) => ({ item, itemKind: 'handle' as const, itemIndex })),
      ...(pkg.dtoTypes ?? []).map((item, itemIndex) => ({ item, itemKind: 'dto' as const, itemIndex })),
      ...(pkg.enumTypes ?? []).map((item, itemIndex) => ({ item, itemKind: 'enum' as const, itemIndex })),
      ...getTsStandaloneFunctions(pkg).map((item, itemIndex) => ({ item, itemKind: 'function' as const, itemIndex })),
    ];
    for (const { item, itemKind, itemIndex } of routeItems) {
      const itemSlug = getTsItemSlug(item, items);
      if (!itemSlug) {
        continue;
      }

      const path: StaticPath = {
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          itemIndex,
          itemKind,
          packageName: pkg.package.name,
        },
      };
      paths.push(path);
      names.set(path, tsSlugify(item.name));
    }
  }

  // Keep previously published base-name exports alongside collision-safe HTML peers.
  const canonical = new Set(paths.map(({ params }) => `${params.module}/${params.item}`));
  const legacy = new Map<string, StaticPath>();
  for (const path of paths) {
    const item = names.get(path)!;
    const key = `${path.params.module}/${item}`;
    if (item && !canonical.has(key)) {
      legacy.set(key, { ...path, params: { ...path.params, item } });
    }
  }
  return withApiCacheKeys([...paths, ...legacy.values()], packages);
}

export const GET: APIRoute = async ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;
  const pkg = await getTsModuleDocument(routeProps.packageName);
  const item = getTsRouteItem<TsItem>(pkg, routeProps.itemKind, routeProps.itemIndex);

  return markdownResponse(
    renderTypeScriptItemMarkdown(pkg, item, routeProps.itemKind, base)
  );
};
