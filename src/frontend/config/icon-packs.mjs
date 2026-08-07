// Icon packs configuration for Mermaid diagrams.
// astro-mermaid now serializes icon packs as name/url pairs, so custom packs
// must be served from a static JSON endpoint instead of an inline loader.

export const iconPacks = [
  {
    // Search: https://icon-sets.iconify.design/logos/?keyword=svg+logos
    name: 'logos',
    url: 'https://unpkg.com/@iconify-json/logos@1/icons.json',
  },
  {
    // Search: https://icon-sets.iconify.design/iconoir/?keyword=iconoir
    name: 'iconoir',
    url: 'https://unpkg.com/@iconify-json/iconoir@1/icons.json',
  },
  {
    // Custom Aspire icons are served from the public folder for safe serialization.
    name: 'aspire',
    url: '/icons/aspire.json',
  },
];
