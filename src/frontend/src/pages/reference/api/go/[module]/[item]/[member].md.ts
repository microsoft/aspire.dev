import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderGoMemberMarkdownPage } from '@utils/go-api-markdown';
import type { GoMemberRouteProps } from '@utils/go-modules';
import { getGoHandleMethod, getGoModuleDocument, getGoModules, goModuleSlug } from '@utils/go-modules';
import { getGoItemSlug, getGoMethods, getGoMethodSlug, getGoTopLevelRouteItems } from '@utils/go-api-routes';

export const prerender = true;

type RouteProps = GoMemberRouteProps;

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

    for (const [handleIndex, handle] of (pkg.handleTypes ?? []).entries()) {
      const itemSlug = getGoItemSlug(handle, items);
      if (!itemSlug) {
        continue;
      }

      const methods = getGoMethods(handle);
      for (const [methodIndex, method] of methods.entries()) {
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
            methodIndex,
            handleIndex,
            packageName: pkg.package.name,
          },
        });
      }
    }
  }

  return paths;
}

export const GET: APIRoute = async ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;

  const pkg = await getGoModuleDocument(routeProps.packageName);
  const { parentType, method } = getGoHandleMethod(pkg, routeProps.handleIndex, routeProps.methodIndex);
  return markdownResponse(renderGoMemberMarkdownPage(pkg, parentType, method, base));
};
