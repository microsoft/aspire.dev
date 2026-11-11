import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { apiDocumentCacheKey } from '@utils/api-cache-key';
import { renderCSharpMemberKindMarkdown } from '@utils/csharp-api-markdown';
<<<<<<< HEAD
import type { PackageMember, PackageMemberRouteProps } from '@utils/packages';
=======
import type { PackageMember, PackageType } from '@utils/packages';
>>>>>>> fc59c3d689464ce2d5e0d309eed81e181cd000c1
import {
  genericArity,
  getPackageDocument,
  getPackages,
  getPackageDocument,
  getPackageType,
  memberKindOrder,
  memberKindSlugs,
  packageSlug,
  slugify,
} from '@utils/packages';

export const prerender = true;

<<<<<<< HEAD
type RouteProps = PackageMemberRouteProps;
=======
type RouteProps = {
  memberKind: string;
  packageName: string;
  type: PackageType;
};
>>>>>>> fc59c3d689464ce2d5e0d309eed81e181cd000c1

type StaticPath = {
  cacheKey: string;
  params: { memberKind: string; package: string; type: string };
  props: RouteProps;
};

export async function getStaticPaths(): Promise<StaticPath[]> {
  const packages = await getPackages();
  const paths: StaticPath[] = [];

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = packageSlug(pkg.package.name);
    const cacheKey = apiDocumentCacheKey(pkg);

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
          cacheKey,
          params: {
            memberKind: memberKindSlug,
            package: pkgSlug,
            type: typeSlug,
          },
          props: {
            memberKind,
            packageName: pkg.package.name,
<<<<<<< HEAD
            typeIndex,
=======
            type,
>>>>>>> fc59c3d689464ce2d5e0d309eed81e181cd000c1
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
<<<<<<< HEAD
  const type = getPackageType(pkg, routeProps.typeIndex);
=======
>>>>>>> fc59c3d689464ce2d5e0d309eed81e181cd000c1

  return markdownResponse(
    renderCSharpMemberKindMarkdown(
      pkg,
<<<<<<< HEAD
      type,
=======
      routeProps.type,
>>>>>>> fc59c3d689464ce2d5e0d309eed81e181cd000c1
      routeProps.memberKind,
      pkg.types,
      base
    )
  );
};
