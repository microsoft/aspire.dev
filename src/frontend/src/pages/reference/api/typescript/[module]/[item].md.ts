import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { withApiCacheKeys } from '@utils/api-cache-key';
import { renderTypeScriptItemMarkdown } from '@utils/typescript-api-markdown';
import type { TsDtoType, TsEnumType, TsFunction, TsHandleType } from '@utils/ts-modules';
import { getTsModuleDocument, getTsModules, tsModuleSlug, tsSlugify } from '@utils/ts-modules';
import { getTsItemSlug, getTsRouteItem, getTsStandaloneFunctions, getTsTopLevelRouteItems } from '@utils/ts-api-routes';

export const prerender = true;

type TypeScriptItemKind = 'handle' | 'dto' | 'enum' | 'function';
type TypeScriptItem = TsHandleType | TsDtoType | TsEnumType | TsFunction;

type RouteProps = {
  itemIndex: number;
  itemKind: TypeScriptItemKind;
  packageName: string;
};

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

    for (const [itemIndex, handle] of (pkg.handleTypes ?? []).entries()) {
      const itemSlug = getTsItemSlug(handle, items);
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
          itemKind: 'handle',
          packageName: pkg.package.name,
        },
      };
      paths.push(path);
      names.set(path, tsSlugify(handle.name));
    }

    for (const [itemIndex, dto] of (pkg.dtoTypes ?? []).entries()) {
      const itemSlug = getTsItemSlug(dto, items);
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
          itemKind: 'dto',
          packageName: pkg.package.name,
        },
      };
      paths.push(path);
      names.set(path, tsSlugify(dto.name));
    }

    for (const [itemIndex, enumType] of (pkg.enumTypes ?? []).entries()) {
      const itemSlug = getTsItemSlug(enumType, items);
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
          itemKind: 'enum',
          packageName: pkg.package.name,
        },
      };
      paths.push(path);
      names.set(path, tsSlugify(enumType.name));
    }

    for (const [itemIndex, fn] of getTsStandaloneFunctions(pkg).entries()) {
      const itemSlug = getTsItemSlug(fn, items);
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
          itemKind: 'function',
          packageName: pkg.package.name,
        },
      };
      paths.push(path);
      names.set(path, tsSlugify(fn.name));
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
  const item = getTsRouteItem<TypeScriptItem>(pkg, routeProps.itemKind, routeProps.itemIndex);

  return markdownResponse(
    renderTypeScriptItemMarkdown(pkg, item, routeProps.itemKind, base)
  );
};
