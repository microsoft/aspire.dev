import type { APIRoute } from 'astro';

import { apiSearchIndexResponse } from '@utils/api-search-index';
import { buildTsApiSearchIndex } from '@utils/ts-api-search';
import { getTsModules } from '@utils/ts-modules';

export const prerender = true;

export const GET: APIRoute = async () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const modules = (await getTsModules())
    .map((entry) => entry.data)
    .sort((a, b) => a.package.name.localeCompare(b.package.name));
  return apiSearchIndexResponse(buildTsApiSearchIndex(modules, base));
};
