/* ------------------------------------------------------------------ */
/*  Build sidebar configuration for TypeScript API reference pages.    */
/* ------------------------------------------------------------------ */

import {
  tsModuleSlug,
  tsSlugify,
  getTsModules,
} from './ts-modules';

/**
 * Generate a sidebar configuration array for TypeScript API reference pages.
 * Each module becomes a collapsible group. Within each module, items are
 * organized by type: handle types, functions, DTOs, and enums.
 */
export async function getTsApiReferenceSidebar() {
  const modules = await getTsModules();
  const sorted = modules
    .map((p) => p.data)
    .sort((a, b) => a.package.name.localeCompare(b.package.name));

  return [
    { label: 'Search TypeScript APIs', link: '/reference/api/typescript/' },
    ...sorted.map((mod) => {
      const modSlug = tsModuleSlug(mod.package.name);
      const items: any[] = [
        { label: 'Overview', link: `/reference/api/typescript/${modSlug}/` },
      ];

      // Types (handles + DTOs merged into one group)
      const allTypes = [
        ...(mod.handleTypes ?? []).filter((t: any) => t.name),
        ...(mod.dtoTypes ?? []).filter((t: any) => t.name),
      ].sort((a: any, b: any) => a.name.localeCompare(b.name));

      if (allTypes.length > 0) {
        items.push({
          label: 'Types',
          collapsed: true,
          items: allTypes.map((t: any) => ({
            label: t.name,
            link: `/reference/api/typescript/${modSlug}/${tsSlugify(t.name)}/`,
          })),
        });
      }

      // Functions — individual pages
      const functions = (mod.functions ?? [])
        .filter((f: any) => f.name && (!f.qualifiedName || !f.qualifiedName.includes('.')));
      if (functions.length > 0) {
        items.push({
          label: 'Functions',
          collapsed: true,
          items: functions
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((f: any) => ({
              label: f.name,
              link: `/reference/api/typescript/${modSlug}/${tsSlugify(f.name)}/`,
            })),
        });
      }

      // Enum types
      const enums = (mod.enumTypes ?? []).filter((t: any) => t.name);
      if (enums.length > 0) {
        items.push({
          label: 'Enums',
          collapsed: true,
          items: enums
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((e: any) => ({
              label: e.name,
              link: `/reference/api/typescript/${modSlug}/${tsSlugify(e.name)}/`,
            })),
        });
      }

      return {
        label: mod.package.name,
        collapsed: true,
        items,
      };
    }),
  ];
}
