import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderGoIndexMarkdown } from '@utils/go-api-markdown';
import { getGoModules } from '@utils/go-modules';

export const prerender = true;

export const GET: APIRoute = async () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const modules = (await getGoModules()).map((entry) => entry.data);
  return markdownResponse(renderGoIndexMarkdown(modules, base));
};
