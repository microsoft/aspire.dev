// Packages that ship a Go AppHost API are the ones with a generated
// `src/data/go-modules/<package>.<version>.json` file. Only file names are
// read here (the glob is lazy), so the large API documents are never loaded.
const goModuleFiles = Object.keys(import.meta.glob('../data/go-modules/*.json'));

const goAppHostPackages = new Set(
  goModuleFiles.map((file) => {
    const fileName = file.slice(file.lastIndexOf('/') + 1);
    return fileName.replace(/\.\d+\.\d+\.\d+.*\.json$/, '').toLowerCase();
  })
);

export function supportsGoAppHost(packageName: string): boolean {
  return goAppHostPackages.has(packageName.toLowerCase());
}
