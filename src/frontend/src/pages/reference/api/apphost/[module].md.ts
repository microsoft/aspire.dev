import type { APIRoute } from 'astro';

import { renderAppHostModuleMarkdown } from '@utils/apphost-api-markdown';
import { markdownResponse } from '@utils/api-markdown-shared';
import {
  type AppHostModuleDocument,
  appHostModuleSlug,
  getAppHostModules,
} from '@utils/apphost-modules';

export const prerender = true;

type Props = { document: AppHostModuleDocument };

export async function getStaticPaths() {
  return (await getAppHostModules()).map((entry) => ({
    params: { module: appHostModuleSlug(entry.data.package.name) },
    props: { document: entry.data },
  }));
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return markdownResponse(renderAppHostModuleMarkdown((props as Props).document, base));
};
