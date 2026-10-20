import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderGoModuleMarkdown } from '@utils/go-api-markdown';
import type { GoApiDocument } from '@utils/go-modules';
import { getGoModules, goModuleSlug } from '@utils/go-modules';

export const prerender = true;

type RouteProps = {
  pkg: GoApiDocument;
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
      pkg: entry.data,
    },
  }));
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;
  return markdownResponse(renderGoModuleMarkdown(routeProps.pkg, base));
};
