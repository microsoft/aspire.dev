import type { APIRoute } from 'astro';

import { renderAppHostIndexMarkdown } from '@utils/apphost-api-markdown';
import { markdownResponse } from '@utils/api-markdown-shared';
import { getAppHostModules } from '@utils/apphost-modules';

export const prerender = true;

export const GET: APIRoute = async () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const documents = (await getAppHostModules()).map((entry) => entry.data);
  return markdownResponse(renderAppHostIndexMarkdown(documents, base));
};
