import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderCSharpPackageMarkdown } from '@utils/csharp-api-markdown';
import { getPackages, packageSlug } from '@utils/packages';

export const prerender = true;

export async function getStaticPaths() {
  const packages = await getPackages();

  return packages.map((entry) => ({
    params: { package: packageSlug(entry.data.package.name) },
    props: {
      pkg: entry.data,
    },
  }));
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as any;
  return markdownResponse(renderCSharpPackageMarkdown(routeProps.pkg, base));
};