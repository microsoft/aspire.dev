import type { APIRoute } from 'astro';

import { apiDocumentCacheKey } from '@utils/api-cache-key';
import { buildCompactGoModuleSidebarTree } from '@utils/go-api-sidebar';
import { getGoModuleDocument, getGoModules, goModuleSlug } from '@utils/go-modules';

export const prerender = true;

type RouteProps = {
  packageName: string;
};

type StaticPath = {
  cacheKey: string;
  params: { module: string };
  props: RouteProps;
};

/**
 * Full sidebar tree for one Go API module, emitted once per module instead
 * of being repeated in the HTML of every item and member page.
 * Loaded by `src/components/starlight/api-sidebar-tree.ts`.
 */
export async function getStaticPaths(): Promise<StaticPath[]> {
  const modules = await getGoModules();

  return modules.map((entry) => ({
    cacheKey: apiDocumentCacheKey(entry.data),
    params: { module: goModuleSlug(entry.data.package.name) },
    props: { packageName: entry.data.package.name },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const doc = await getGoModuleDocument((props as RouteProps).packageName);
  return new Response(
    JSON.stringify({
      hash: apiDocumentCacheKey(doc),
      items: buildCompactGoModuleSidebarTree(doc),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
};