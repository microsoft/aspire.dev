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

      // Handle types with their capabilities
      const handles = (mod.handleTypes ?? []).filter((t: any) => t.name);
      if (handles.length > 0) {
        items.push({
          label: 'Handle Types',
          collapsed: true,
          items: handles
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((h: any) => ({
              label: h.name,
              link: `/reference/api/typescript/${modSlug}/${tsSlugify(h.name)}/`,
            })),
        });
      }

      // DTO types
      const dtos = (mod.dtoTypes ?? []).filter((t: any) => t.name);
      if (dtos.length > 0) {
        items.push({
          label: 'Types',
          collapsed: true,
          items: dtos
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((d: any) => ({
              label: d.name,
              link: `/reference/api/typescript/${modSlug}/${tsSlugify(d.name)}/`,
            })),
        });
      }

      // Enum types
      const enums = (mod.enumTypes ?? []).filter((t: any) => t.name);
      if (enums.length > 0) {
        items.push({
          label: 'Enumerations',
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
