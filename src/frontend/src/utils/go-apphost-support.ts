// A Go button is only useful when the destination article has a Go tab, so the
// check looks at the docs themselves. Packages also need a generated Go module.
const goModuleFiles = Object.keys(import.meta.glob('../data/go-modules/*.json'));

const goAppHostPackages = new Set(
  goModuleFiles.map((file) => {
    const fileName = file.slice(file.lastIndexOf('/') + 1);
    return fileName.replace(/\.\d+\.\d+\.\d+.*\.json$/, '').toLowerCase();
  })
);

const integrationDocs = import.meta.glob('../content/docs/integrations/**/*.mdx', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const docsByRoute = new Map<string, () => Promise<string>>();
for (const [file, load] of Object.entries(integrationDocs)) {
  const route = file
    .replace('../content/docs', '')
    .replace(/\/index\.mdx$/, '')
    .replace(/\.mdx$/, '');
  docsByRoute.set(route, load);
}

export function supportsGoAppHost(packageName: string): boolean {
  return goAppHostPackages.has(packageName.toLowerCase());
}

/** True when the package has a Go module and its host article contains a Go tab. */
export async function hasGoAppHostDocs(packageName: string, docsUrl: string): Promise<boolean> {
  if (!supportsGoAppHost(packageName)) return false;
  const route = docsUrl.split(/[?#]/)[0].replace(/\/$/, '');
  const load = docsByRoute.get(route);
  if (!load) return false;
  return /<TabItem[^>]*\bid="go"/.test(await load());
}
