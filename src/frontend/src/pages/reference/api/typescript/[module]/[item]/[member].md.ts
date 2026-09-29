import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderTypeScriptMemberMarkdownPage } from '@utils/typescript-api-markdown';
import type { TsApiDocument, TsFunction, TsHandleType } from '@utils/ts-modules';
import { getTsModules, tsModuleSlug, tsSlugify } from '@utils/ts-modules';
import { getTsItemSlug, getTsMethods, getTsMethodSlug, getTsTopLevelRouteItems } from '@utils/ts-api-routes';

export const prerender = true;

type RouteProps = {
  method: TsFunction;
  parentType: TsHandleType;
  pkg: TsApiDocument;
};

type StaticPath = {
  params: { item: string; member: string; module: string };
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

      const methods = getTsMethods(handle);
      for (const method of methods) {
        const memberSlug = getTsMethodSlug(method, methods, handle.name);
        if (!memberSlug) {
          continue;
        }

        paths.push({
          params: {
            item: itemSlug,
            member: memberSlug,
            module: pkgSlug,
          },
          props: {
            method,
            parentType: handle,
            pkg,
          },
        });
      }
    }
  }

  const canonical = new Set(paths.map(({ params }) => `${params.module}/${params.item}/${params.member}`));
  const legacy = new Map<string, StaticPath>();
  for (const path of paths) {
    const item = tsSlugify(path.props.parentType.name);
    const member = tsSlugify(path.props.method.name);
    const key = `${path.params.module}/${item}/${member}`;
    if (item && member && !canonical.has(key)) {
      legacy.set(key, { ...path, params: { ...path.params, item, member } });
    }
  }
  return [...paths, ...legacy.values()];
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;

  return markdownResponse(
    renderTypeScriptMemberMarkdownPage(routeProps.pkg, routeProps.parentType, routeProps.method, base)
  );
};
