import type { APIRoute } from 'astro';

import { getLatestSchema } from '@utils/cli-config-schema';

export const prerender = true;

export const GET: APIRoute = async () => {
  const schema = await getLatestSchema();
  return new Response(JSON.stringify(schema, null, 2), {
    headers: {
      'Content-Type': 'application/schema+json; charset=utf-8',
    },
  });
};
