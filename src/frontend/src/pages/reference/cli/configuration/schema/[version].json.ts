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

export async function getStaticPaths(): Promise<StaticPath[]> {
  const versions = await getSchemaVersions();
  return versions
    .map((version) => {
      const schema = getSchemaByVersion(version);
      if (!schema) return null;
      return {
        params: { version },
        props: { schema },
      };
    })
    .filter((entry): entry is StaticPath => entry !== null);
}

export const GET: APIRoute = ({ props }) => {
  const { schema } = props as RouteProps;
  return new Response(JSON.stringify(schema, null, 2), {
    headers: {
      'Content-Type': 'application/schema+json; charset=utf-8',
    },
  });
};
