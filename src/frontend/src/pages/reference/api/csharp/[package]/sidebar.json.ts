import type { APIRoute } from 'astro';

import { apiDocumentCacheKey } from '@utils/api-cache-key';
import { buildCompactPackageSidebarTree } from '@utils/api-sidebar';
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

/**
 * Full sidebar tree for one C# package, emitted once per package instead of
 * being repeated in the HTML of every type and member page.
 * Loaded by `src/components/starlight/api-sidebar-tree.ts`.
 */
export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getPackages();

  return packages.map((entry) => ({
    cacheKey: apiDocumentCacheKey(entry.data),
    params: { package: packageSlug(entry.data.package.name) },
    props: { packageName: entry.data.package.name },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const pkg = await getPackageDocument((props as RouteProps).packageName);
  return new Response(
    JSON.stringify({
      hash: apiDocumentCacheKey(pkg),
      items: buildCompactPackageSidebarTree(pkg),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
};
