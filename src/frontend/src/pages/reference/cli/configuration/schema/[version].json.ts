import type { APIRoute } from 'astro';

import { getSchemaByVersion, getSchemaVersions } from '@utils/cli-config-schema';

export const prerender = true;

type RouteProps = {
  schema: Record<string, unknown>;
};

type StaticPath = {
  params: { version: string };
  props: RouteProps;
};

export function getStaticPaths(): StaticPath[] {
  return getSchemaVersions().map((version) => ({
    params: { version },
    props: { schema: getSchemaByVersion(version) as Record<string, unknown> },
  }));
}

export const GET: APIRoute = ({ props }) => {
  const { schema } = props as RouteProps;
  return new Response(JSON.stringify(schema, null, 2), {
    headers: {
      'Content-Type': 'application/schema+json; charset=utf-8',
    },
  });
};
