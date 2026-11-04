import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderCSharpMemberKindMarkdown } from '@utils/csharp-api-markdown';
import type { PackageMember, PackageMemberRouteProps } from '@utils/packages';
import {
  genericArity,
  getPackages,
  getPackageDocument,
  getPackageType,
  memberKindOrder,
  memberKindSlugs,
  packageSlug,
  slugify,
} from '@utils/packages';

export const prerender = true;

type RouteProps = PackageMemberRouteProps;

type StaticPath = {
  params: { memberKind: string; package: string; type: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getPackages();
  const paths: StaticPath[] = [];

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = packageSlug(pkg.package.name);

    for (const [typeIndex, type] of pkg.types.entries()) {
      const typeSlug = slugify(type.name, genericArity(type));
      if (!typeSlug) {
        continue;
      }

      const members = type.members ?? [];
      for (const memberKind of memberKindOrder) {
        const memberKindSlug = memberKindSlugs[memberKind];
        if (!memberKindSlug || !members.some((member: PackageMember) => member.kind === memberKind)) {
          continue;
        }

        paths.push({
          params: {
            memberKind: memberKindSlug,
            package: pkgSlug,
            type: typeSlug,
          },
          props: {
            memberKind,
            packageName: pkg.package.name,
            typeIndex,
          },
        });
      }
    }
  }

  return paths;
}

export const GET: APIRoute = async ({ props }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const routeProps = props as RouteProps;
  const pkg = await getPackageDocument(routeProps.packageName);
  const type = getPackageType(pkg, routeProps.typeIndex);

  return markdownResponse(
    renderCSharpMemberKindMarkdown(
      pkg,
      type,
      routeProps.memberKind,
      pkg.types,
      base
    )
  );
};
