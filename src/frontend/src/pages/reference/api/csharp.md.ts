import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderCSharpIndexMarkdown } from '@utils/csharp-api-markdown';
import { getPackages } from '@utils/packages';

export const prerender = true;

export const GET: APIRoute = async () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const packages = (await getPackages()).map((entry) => entry.data);
  return markdownResponse(renderCSharpIndexMarkdown(packages, base));
};