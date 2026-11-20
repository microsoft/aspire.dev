import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { apiDocumentCacheKey } from '@utils/api-cache-key';
import { renderCSharpPackageMarkdown } from '@utils/csharp-api-markdown';
import { getPackageDocument, getPackages, packageSlug } from '@utils/packages';

export const prerender = true;

type RouteProps = {
  packageName: string;
};

type StaticPath = {
  cacheKey: string;
  params: { package: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getPackages();

  return packages.map((entry) => ({
    cacheKey: apiDocumentCacheKey(entry.data),
    params: { package: packageSlug(entry.data.package.name) },
    props: {
      packageName: entry.data.package.name,
    },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;
  const pkg = await getPackageDocument(routeProps.packageName);
  return markdownResponse(renderCSharpPackageMarkdown(pkg, base));
};
