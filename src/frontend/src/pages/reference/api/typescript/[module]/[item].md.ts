import type { APIRoute } from 'astro';

import { getAppHostItemSlug, getAppHostTopLevelItems } from '@utils/apphost-api-routes';
import { appHostModuleSlug, getAppHostModules, projectAppHostModule } from '@utils/apphost-modules';
import {
  getAppHostTypeScriptMarkdownTarget,
  getAppHostTypeScriptRouteAliases,
} from '@utils/apphost-typescript-route-aliases';
import { getTsItemSlug, getTsTopLevelRouteItems } from '@utils/ts-api-routes';

export const prerender = true;

export async function getStaticPaths() {
  const paths = [];
  for (const entry of await getAppHostModules()) {
    const sharedItems = getAppHostTopLevelItems(entry.data);
    const tsDocument = projectAppHostModule(entry.data, 'typescript');
    const tsItems = getTsTopLevelRouteItems(tsDocument);
    for (const tsItem of tsItems) {
      const sharedItem = sharedItems.find((item) => item.id === tsItem.id);
      if (!sharedItem) continue;
      paths.push({
        params: {
          module: appHostModuleSlug(entry.data.package.name),
          item: getTsItemSlug(tsItem, tsItems),
        },
        props: {
          target: `/reference/api/apphost/${appHostModuleSlug(entry.data.package.name)}/${getAppHostItemSlug(sharedItem, sharedItems)}/`,
        },
      });
    }
  }
  const routeKeys = new Set(
    paths.map((path) => `${path.params.module}/${path.params.item}`)
  );
  for (const alias of getAppHostTypeScriptRouteAliases(2)) {
    if (routeKeys.has(alias.source)) continue;
    const [module, item] = alias.source.split('/');
    paths.push({
      params: { module, item },
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
    headers: {
      Location: getAppHostTypeScriptMarkdownTarget(props.target),
    },
  });
};
