import type { APIRoute } from 'astro';

import { appHostModuleSlug, getAppHostModules } from '@utils/apphost-modules';
import {
  getAppHostTypeScriptMarkdownTarget,
  getAppHostTypeScriptRouteAliases,
} from '@utils/apphost-typescript-route-aliases';

export const prerender = true;

export async function getStaticPaths() {
  const paths = (await getAppHostModules()).map((entry) => ({
    params: { module: appHostModuleSlug(entry.data.package.name) },
    props: {
      target: `/reference/api/apphost/${appHostModuleSlug(entry.data.package.name)}/`,
    },
  }));
  const routeKeys = new Set(paths.map((path) => path.params.module));
  for (const alias of getAppHostTypeScriptRouteAliases(1)) {
    if (routeKeys.has(alias.source)) continue;
    paths.push({
      params: { module: alias.source },
      props: { target: alias.target },
    });
    routeKeys.add(alias.source);
  }
  return paths;
}

export const GET: APIRoute = ({ props }) => {
  if (typeof props.target !== 'string') {
    throw new TypeError('Missing TypeScript API Markdown redirect target.');
  }

  return new Response(null, {
    status: 308,
    headers: { Location: getAppHostTypeScriptMarkdownTarget(props.target) },
  });
};
