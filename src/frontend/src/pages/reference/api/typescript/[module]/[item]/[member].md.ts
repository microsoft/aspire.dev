import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { withApiCacheKeys } from '@utils/api-cache-key';
import { renderTypeScriptMemberMarkdownPage } from '@utils/typescript-api-markdown';
import type { TsFunction, TsHandleType } from '@utils/ts-modules';
import { getTsModuleDocument, getTsModules, tsModuleSlug, tsSlugify } from '@utils/ts-modules';
import { getTsHandleMethod, getTsItemSlug, getTsMethods, getTsMethodSlug, getTsTopLevelRouteItems } from '@utils/ts-api-routes';

export const prerender = true;

type RouteProps = {
  handleIndex: number;
  methodIndex: number;
  packageName: string;
};

type StaticPath = {
  params: { item: string; member: string; module: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<Array<StaticPath & { cacheKey: string }>> {
  const packages = await getTsModules();
  const paths: StaticPath[] = [];
  const names = new Map<StaticPath, { member: string; item: string }>();

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = tsModuleSlug(pkg.package.name);
    const items = getTsTopLevelRouteItems(pkg);

    for (const [handleIndex, handle] of (pkg.handleTypes ?? []).entries()) {
      const itemSlug = getTsItemSlug(handle, items);
      if (!itemSlug) {
        continue;
      }

      const methods = getTsMethods(handle);
      for (const [methodIndex, method] of methods.entries()) {
        const memberSlug = getTsMethodSlug(method, methods, handle.name);
        if (!memberSlug) {
          continue;
        }

        const path: StaticPath = {
          params: {
            item: itemSlug,
            member: memberSlug,
            module: pkgSlug,
          },
          props: {
            handleIndex,
            methodIndex,
            packageName: pkg.package.name,
          },
        };
        paths.push(path);
        names.set(path, { item: tsSlugify(handle.name), member: tsSlugify(method.name) });
      }
    }
  }

  const canonical = new Set(paths.map(({ params }) => `${params.module}/${params.item}/${params.member}`));
  const legacy = new Map<string, StaticPath>();
  for (const path of paths) {
    const { item, member } = names.get(path)!;
    const key = `${path.params.module}/${item}/${member}`;
    if (item && member && !canonical.has(key)) {
      legacy.set(key, { ...path, params: { ...path.params, item, member } });
    }
  }
  return withApiCacheKeys([...paths, ...legacy.values()], packages);
}

export const GET: APIRoute = async ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;
  const pkg = await getTsModuleDocument(routeProps.packageName);
  const { parentType, method } = getTsHandleMethod<TsFunction, TsHandleType>(
    pkg.handleTypes,
    routeProps.handleIndex,
    routeProps.methodIndex
  );

  return markdownResponse(
    renderTypeScriptMemberMarkdownPage(pkg, parentType, method, base)
  );
};
