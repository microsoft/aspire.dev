import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { apiDocumentCacheKey } from '@utils/api-cache-key';
import { renderTypeScriptModuleMarkdown } from '@utils/typescript-api-markdown';
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

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getTsModules();

  return packages.map((entry) => ({
    cacheKey: apiDocumentCacheKey(entry.data),
    params: { module: tsModuleSlug(entry.data.package.name) },
    props: {
      packageName: entry.data.package.name,
    },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;
  const pkg = await getTsModuleDocument(routeProps.packageName);
  return markdownResponse(renderTypeScriptModuleMarkdown(pkg, base));
};
