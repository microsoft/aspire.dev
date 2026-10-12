import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderTypeScriptItemMarkdown } from '@utils/typescript-api-markdown';
import type { TsApiDocument, TsDtoType, TsEnumType, TsFunction, TsHandleType } from '@utils/ts-modules';
import { getTsModules, tsModuleSlug, tsSlugify } from '@utils/ts-modules';
import { getTsItemSlug, getTsStandaloneFunctions, getTsTopLevelRouteItems } from '@utils/ts-api-routes';

export const prerender = true;

type TypeScriptItemKind = 'handle' | 'dto' | 'enum' | 'function';
type TypeScriptItem = TsHandleType | TsDtoType | TsEnumType | TsFunction;

type RouteProps = {
  item: TypeScriptItem;
  itemKind: TypeScriptItemKind;
  pkg: TsApiDocument;
};

type StaticPath = {
  params: { item: string; module: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getTsModules();
  const paths: StaticPath[] = [];

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = tsModuleSlug(pkg.package.name);
    const items = getTsTopLevelRouteItems(pkg);

    for (const handle of pkg.handleTypes ?? []) {
      const itemSlug = getTsItemSlug(handle, items);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          item: handle,
          itemKind: 'handle',
          pkg,
        },
      });
    }

    for (const dto of pkg.dtoTypes ?? []) {
      const itemSlug = getTsItemSlug(dto, items);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          item: dto,
          itemKind: 'dto',
          pkg,
        },
      });
    }

    for (const enumType of pkg.enumTypes ?? []) {
      const itemSlug = getTsItemSlug(enumType, items);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          item: enumType,
          itemKind: 'enum',
          pkg,
        },
      });
    }

    for (const fn of getTsStandaloneFunctions(pkg)) {
      const itemSlug = getTsItemSlug(fn, items);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          item: fn,
          itemKind: 'function',
          pkg,
        },
      });
    }
  }

  // Keep previously published base-name exports alongside collision-safe HTML peers.
  const canonical = new Set(paths.map(({ params }) => `${params.module}/${params.item}`));
  const legacy = new Map<string, StaticPath>();
  for (const path of paths) {
    const item = tsSlugify(path.props.item.name);
    const key = `${path.params.module}/${item}`;
    if (item && !canonical.has(key)) {
      legacy.set(key, { ...path, params: { ...path.params, item } });
    }
  }
  return [...paths, ...legacy.values()];
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;

  return markdownResponse(
    renderTypeScriptItemMarkdown(routeProps.pkg, routeProps.item, routeProps.itemKind, base)
  );
};
