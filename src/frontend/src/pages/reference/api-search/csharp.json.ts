import type { APIRoute } from 'astro';

import { apiSearchIndexResponse, buildCSharpApiSearchIndex } from '@utils/api-search-index';
import { getPackages } from '@utils/packages';

export const prerender = true;

export const GET: APIRoute = async () => {
  const packages = (await getPackages())
    .map((entry) => entry.data)
    .sort((a, b) => a.package.name.localeCompare(b.package.name));
  return apiSearchIndexResponse(buildCSharpApiSearchIndex(packages).index);
};
