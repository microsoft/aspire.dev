import type { APIRoute } from 'astro';

import { markdownResponse } from '@utils/api-markdown-shared';
import { renderTypeScriptItemMarkdown } from '@utils/typescript-api-markdown';
import { getTsModules, tsModuleSlug, tsSlugify } from '@utils/ts-modules';

export const prerender = true;

export async function getStaticPaths() {
  const packages = await getTsModules();
  const paths: any[] = [];

  for (const entry of packages) {
    const pkg = entry.data;
    const pkgSlug = tsModuleSlug(pkg.package.name);

    for (const handle of pkg.handleTypes ?? []) {
      const itemSlug = tsSlugify(handle.name);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          item: handle,
          itemKind: 'handle',
          pkg,
        },
      });
    }

    for (const dto of pkg.dtoTypes ?? []) {
      const itemSlug = tsSlugify(dto.name);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          item: dto,
          itemKind: 'dto',
          pkg,
        },
      });
    }

    for (const enumType of pkg.enumTypes ?? []) {
      const itemSlug = tsSlugify(enumType.name);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          item: enumType,
          itemKind: 'enum',
          pkg,
        },
      });
    }

    for (const fn of (pkg.functions ?? []).filter(
      (candidate: any) => !candidate.qualifiedName || !candidate.qualifiedName.includes('.')
    )) {
      const itemSlug = tsSlugify(fn.name);
      if (!itemSlug) {
        continue;
      }

      paths.push({
        params: {
          item: itemSlug,
          module: pkgSlug,
        },
        props: {
          item: fn,
          itemKind: 'function',
          pkg,
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
    renderTypeScriptItemMarkdown(routeProps.pkg, routeProps.item, routeProps.itemKind, base)
  );
};