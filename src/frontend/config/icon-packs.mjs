// Icon packs configuration for Mermaid diagrams.
// astro-mermaid@1.3.1 serializes each pack's `loader` function to a string at
// build time and reconstructs it on the client with `new Function(...)()`, so
// each pack must expose a `loader` arrow function (not a `url` string).

export const iconPacks = [
  {
    // Search: https://icon-sets.iconify.design/logos/?keyword=svg+logos
    name: 'logos',
    loader: () => fetch('https://unpkg.com/@iconify-json/logos@1/icons.json').then((r) => r.json()),
  },
  {
    // Search: https://icon-sets.iconify.design/iconoir/?keyword=iconoir
    name: 'iconoir',
    loader: () => fetch('https://unpkg.com/@iconify-json/iconoir@1/icons.json').then((r) => r.json()),
  },
  {
    // Custom Aspire icons are served from the public folder.
    name: 'aspire',
    loader: () => fetch('/icons/aspire.json').then((r) => r.json()),
  },
];
