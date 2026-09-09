import type { APIRoute } from 'astro';

import { getAppHostItemSlug, getAppHostMemberSlug, getAppHostTopLevelItems } from '@utils/apphost-api-routes';
import {
  appHostModuleSlug,
  getAppHostModules,
  getCapabilitiesForHandle,
  projectAppHostModule,
} from '@utils/apphost-modules';
import {
  getAppHostTypeScriptMarkdownTarget,
  getAppHostTypeScriptRouteAliases,
} from '@utils/apphost-typescript-route-aliases';
import { getTsItemSlug, getTsMethodSlug, getTsTopLevelRouteItems } from '@utils/ts-api-routes';

export const prerender = true;

export async function getStaticPaths() {
  const paths = [];
  for (const entry of await getAppHostModules()) {
    const sharedItems = getAppHostTopLevelItems(entry.data);
    const tsDocument = projectAppHostModule(entry.data, 'typescript');
    const tsItems = getTsTopLevelRouteItems(tsDocument);
    for (const tsHandle of tsDocument.handleTypes) {
      const sharedHandle = sharedItems.find((item) => item.id === tsHandle.id);
      if (!sharedHandle) continue;
      const sharedMembers = getCapabilitiesForHandle(entry.data, sharedHandle);
      const tsMethods = tsHandle.capabilities ?? [];
      for (const tsMethod of tsMethods) {
        const sharedMember = sharedMembers.find((item) => item.id === tsMethod.id);
        if (!sharedMember) continue;
        paths.push({
          params: {
            module: appHostModuleSlug(entry.data.package.name),
            item: getTsItemSlug(tsHandle, tsItems),
            member: getTsMethodSlug(tsMethod, tsMethods, tsHandle.name),
          },
          props: {
            target: `/reference/api/apphost/${appHostModuleSlug(entry.data.package.name)}/${getAppHostItemSlug(sharedHandle, sharedItems)}/${getAppHostMemberSlug(sharedMember, sharedMembers, sharedHandle.name)}/`,
          },
        });
      }
    }
  }
  const routeKeys = new Set(
    paths.map((path) => `${path.params.module}/${path.params.item}/${path.params.member}`)
  );
  for (const alias of getAppHostTypeScriptRouteAliases(3)) {
    if (routeKeys.has(alias.source)) continue;
    const [module, item, member] = alias.source.split('/');
    paths.push({
      params: { module, item, member },
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
