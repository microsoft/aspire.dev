import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderTypeScriptMemberMarkdownPage } from '@utils/typescript-api-markdown';
import type { TsApiDocument, TsFunction, TsHandleType } from '@utils/ts-modules';
import { getTsModules, tsModuleSlug, tsSlugify } from '@utils/ts-modules';

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

    for (const handle of pkg.handleTypes ?? []) {
      const itemSlug = tsSlugify(handle.name);
      if (!itemSlug) {
        continue;
      }

      for (const method of (handle.capabilities ?? []).filter(
        (capability) => capability.kind === 'Method' || capability.kind === 'InstanceMethod'
      )) {
        const memberSlug = tsSlugify(method.name);
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
    renderTypeScriptMemberMarkdownPage(routeProps.pkg, routeProps.parentType, routeProps.method, base)
  );
};
