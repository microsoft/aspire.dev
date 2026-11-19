import { apiDocumentCacheKey } from './api-cache-key';
import { getGoModules, goModuleSlug } from './go-modules';
import { getPackages, packageSlug } from './packages';
import { getTsModules, tsModuleSlug } from './ts-modules';

export type ApiSidebarTreeLanguage = 'csharp' | 'typescript' | 'go';

const treePathPattern = /\/reference\/api\/(csharp|typescript|go)\/([^/]+)\//;

async function findDocument(language: ApiSidebarTreeLanguage, slug: string): Promise<object | undefined> {
  if (language === 'csharp') {
    return (await getPackages()).find(({ data }) => packageSlug(data.package.name) === slug)?.data;
  }
  if (language === 'typescript') {
    return (await getTsModules()).find(({ data }) => tsModuleSlug(data.package.name) === slug)?.data;
  }
  return (await getGoModules()).find(({ data }) => goModuleSlug(data.package.name) === slug)?.data;
}

/**
 * URL of the full sidebar tree for the package or module that owns `pathname`,
 * versioned with the same content hash the `sidebar.json` payload carries so
 * the edge can cache it indefinitely. Returns `undefined` outside package/module pages.
 */
export async function getApiSidebarTreeSrc(pathname: string, base = ''): Promise<string | undefined> {
  const match = pathname.match(treePathPattern);
  if (!match) return undefined;
  const [, language, slug] = match as unknown as [string, ApiSidebarTreeLanguage, string];
  const document = await findDocument(language, slug);
  if (!document) return undefined;
  return `${base}/reference/api/${language}/${slug}/sidebar.json?v=${apiDocumentCacheKey(document)}`;
}
