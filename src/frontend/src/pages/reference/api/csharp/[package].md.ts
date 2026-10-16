import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderCSharpPackageMarkdown } from '@utils/csharp-api-markdown';
import type { PackageApiDocument } from '@utils/packages';
import { getPackages, packageSlug } from '@utils/packages';
import { resolveCSharpApiRoute } from '@utils/api-route-data';

export const prerender = true;

type RouteProps = {
  pkg: PackageApiDocument;
};

type StaticPath = {
  params: { package: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getPackages();

  return packages.map((entry) => ({
    params: { package: packageSlug(entry.data.package.name) },
    props: {
      pkg: entry.data,
    },
  }));
}

export const GET: APIRoute = async ({ props, url }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = (props.pkg ? props : await resolveCSharpApiRoute(url.pathname)) as RouteProps | undefined;
  if (!routeProps) return new Response('API package not found', { status: 404 });
  return markdownResponse(renderCSharpPackageMarkdown(routeProps.pkg, base));
};
