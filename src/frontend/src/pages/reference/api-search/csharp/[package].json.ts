import type { APIRoute } from 'astro';

import { apiSearchIndexResponse, buildCSharpPackageSearchIndex } from '@utils/api-search-index';
import type { PackageApiDocument } from '@utils/packages';
import { getPackages, packageSlug } from '@utils/packages';

export const prerender = true;

type RouteProps = {
  pkg: PackageApiDocument;
};

export async function getStaticPaths() {
  const packages = await getPackages();
  return packages.map((entry) => ({
    params: { package: packageSlug(entry.data.package.name) },
    props: { pkg: entry.data } satisfies RouteProps,
  }));
}

export const GET: APIRoute = ({ props }) => {
  const { pkg } = props as RouteProps;
  return apiSearchIndexResponse(buildCSharpPackageSearchIndex(pkg.types.filter((type) => type.name)).index);
};
