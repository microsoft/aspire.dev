import type { APIRoute } from 'astro';

import { renderAppHostItemMarkdown } from '@utils/apphost-api-markdown';
import { getAppHostItemSlug, getAppHostTopLevelItems } from '@utils/apphost-api-routes';
import { markdownResponse } from '@utils/api-markdown-shared';
import {
  type AppHostApiItem,
  type AppHostModuleDocument,
  appHostModuleSlug,
  getAppHostModules,
} from '@utils/apphost-modules';

export const prerender = true;

type Props = { document: AppHostModuleDocument; item: AppHostApiItem };

export async function getStaticPaths() {
  const paths = [];
  for (const entry of await getAppHostModules()) {
    const items = getAppHostTopLevelItems(entry.data);
    for (const item of items) {
      paths.push({
        params: {
          module: appHostModuleSlug(entry.data.package.name),
          item: getAppHostItemSlug(item, items),
        },
        props: { document: entry.data, item },
      });
    }
  }
  return paths;
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as Props;
  return markdownResponse(renderAppHostItemMarkdown(routeProps.document, routeProps.item, base));
};
