import type { APIRoute } from 'astro';

import { apiDocumentCacheKey } from '@utils/api-cache-key';
import { buildCompactTsModuleSidebarTree } from '@utils/ts-api-sidebar';
import { getTsModuleDocument, getTsModules, tsModuleSlug } from '@utils/ts-modules';

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
 * Full sidebar tree for one TypeScript API module, emitted once per module instead
 * of being repeated in the HTML of every item and member page.
 * Loaded by `src/components/starlight/api-sidebar-tree.ts`.
 */
export async function getStaticPaths(): Promise<StaticPath[]> {
  const modules = await getTsModules();

  return modules.map((entry) => ({
    cacheKey: apiDocumentCacheKey(entry.data),
    params: { module: tsModuleSlug(entry.data.package.name) },
    props: { packageName: entry.data.package.name },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const doc = await getTsModuleDocument((props as RouteProps).packageName);
  return new Response(
    JSON.stringify({
      hash: apiDocumentCacheKey(doc),
      items: buildCompactTsModuleSidebarTree(doc),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
};