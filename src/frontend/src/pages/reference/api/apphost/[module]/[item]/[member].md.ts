import type { APIRoute } from 'astro';

import { renderAppHostMemberMarkdown } from '@utils/apphost-api-markdown';
import { getAppHostItemSlug, getAppHostMemberSlug, getAppHostTopLevelItems } from '@utils/apphost-api-routes';
import { markdownResponse } from '@utils/api-markdown-shared';
import {
  type AppHostApiItem,
  type AppHostModuleDocument,
  appHostModuleSlug,
  getAppHostModules,
  getCapabilitiesForHandle,
} from '@utils/apphost-modules';

export const prerender = true;

type Props = {
  document: AppHostModuleDocument;
  handle: AppHostApiItem;
  member: AppHostApiItem;
};

export async function getStaticPaths() {
  const paths = [];
  for (const entry of await getAppHostModules()) {
    const items = getAppHostTopLevelItems(entry.data);
    for (const handle of items.filter((item) => item.kind === 'handle')) {
      const members = getCapabilitiesForHandle(entry.data, handle);
      for (const member of members) {
        paths.push({
          params: {
            module: appHostModuleSlug(entry.data.package.name),
            item: getAppHostItemSlug(handle, items),
            member: getAppHostMemberSlug(member, members, handle.name),
          },
          props: { document: entry.data, handle, member },
        });
      }
    }
  }
  return paths;
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as Props;
  return markdownResponse(
    renderAppHostMemberMarkdown(
      routeProps.document,
      routeProps.handle,
      routeProps.member,
      base
    )
  );
};
