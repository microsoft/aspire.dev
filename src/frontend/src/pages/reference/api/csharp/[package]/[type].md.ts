import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderCSharpTypeMarkdown } from '@utils/csharp-api-markdown';
import { genericArity, getPackages, packageSlug, slugify } from '@utils/packages';

export const prerender = true;

export async function getStaticPaths() {
  const packages = await getPackages();
  const paths: any[] = [];

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = packageSlug(pkg.package.name);

    for (const type of pkg.types) {
      const typeSlug = slugify(type.name, genericArity(type));
      if (!typeSlug) {
        continue;
      }

      paths.push({
        params: {
          package: pkgSlug,
          type: typeSlug,
        },
        props: {
          allTypes: pkg.types,
          pkg,
          type,
        },
      });
    }
  }

  return paths;
}

export const GET: APIRoute = ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as any;

  return markdownResponse(
    renderCSharpTypeMarkdown(routeProps.pkg, routeProps.type, routeProps.allTypes, base)
  );
};