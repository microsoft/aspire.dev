import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderGoModuleMarkdown } from '@utils/go-api-markdown';
import { getGoModuleDocument, getGoModules, goModuleSlug } from '@utils/go-modules';

export const prerender = true;

type RouteProps = {
  packageName: string;
};

type StaticPath = {
  params: { module: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getGoModules();

  return packages.map((entry) => ({
    params: { module: goModuleSlug(entry.data.package.name) },
    props: {
      packageName: entry.data.package.name,
    },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;
  const pkg = await getGoModuleDocument(routeProps.packageName);
  return markdownResponse(renderGoModuleMarkdown(pkg, base));
};
