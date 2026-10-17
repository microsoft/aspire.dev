import type { APIRoute } from 'astro';
import { apiCacheKey } from '@utils/api-build-cache';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderTypeScriptModuleMarkdown } from '@utils/typescript-api-markdown';
import type { TsApiDocument } from '@utils/ts-modules';
import { getTsModules, tsModuleSlug } from '@utils/ts-modules';

export const prerender = true;

type RouteProps = {
  pkg: TsApiDocument;
};

type StaticPath = {
  cacheKey?: string;
  params: { module: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getTsModules();

  return packages.map((entry) => ({
    cacheKey: apiCacheKey(entry.data),
    params: { module: tsModuleSlug(entry.data.package.name) },
    props: {
      pkg: entry.data,
    },
  }));
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;
  return markdownResponse(renderTypeScriptModuleMarkdown(routeProps.pkg, base));
};
