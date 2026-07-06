import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderTypeScriptIndexMarkdown } from '@utils/typescript-api-markdown';
import { getTsModules } from '@utils/ts-modules';

export const prerender = true;

export const GET: APIRoute = async () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const modules = (await getTsModules()).map((entry) => entry.data);
  return markdownResponse(renderTypeScriptIndexMarkdown(modules, base));
};