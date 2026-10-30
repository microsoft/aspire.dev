import type { APIRoute } from 'astro';

import { apiSearchIndexResponse, buildTsModuleSearchIndex } from '@utils/api-search-index';
import type { TsApiDocument } from '@utils/ts-modules';
import { getTsModules, tsModuleSlug } from '@utils/ts-modules';

export const prerender = true;

type RouteProps = {
  pkg: TsApiDocument;
};

export async function getStaticPaths() {
  const modules = await getTsModules();
  return modules.map((entry) => ({
    params: { module: tsModuleSlug(entry.data.package.name) },
    props: { pkg: entry.data } satisfies RouteProps,
  }));
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const { pkg } = props as RouteProps;
  return apiSearchIndexResponse(buildTsModuleSearchIndex(pkg, base).index);
};
