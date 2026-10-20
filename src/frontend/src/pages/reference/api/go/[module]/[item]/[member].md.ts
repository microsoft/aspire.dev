import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderGoMemberMarkdownPage } from '@utils/go-api-markdown';
import type { GoApiDocument, GoFunction, GoHandleType } from '@utils/go-modules';
import { getGoModules, goModuleSlug } from '@utils/go-modules';
import { getGoItemSlug, getGoMethods, getGoMethodSlug, getGoTopLevelRouteItems } from '@utils/go-api-routes';

export const prerender = true;

type RouteProps = {
  method: GoFunction;
  parentType: GoHandleType;
  pkg: GoApiDocument;
};

type StaticPath = {
  params: { item: string; member: string; module: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getGoModules();
  const paths: StaticPath[] = [];

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = goModuleSlug(pkg.package.name);
    const items = getGoTopLevelRouteItems(pkg);

    for (const handle of pkg.handleTypes ?? []) {
      const itemSlug = getGoItemSlug(handle, items);
      if (!itemSlug) {
        continue;
      }

      const methods = getGoMethods(handle);
      for (const method of methods) {
        const memberSlug = getGoMethodSlug(method, methods, handle.name);
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

  return paths;
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;

  return markdownResponse(
    renderGoMemberMarkdownPage(routeProps.pkg, routeProps.parentType, routeProps.method, base)
  );
};
