import { createHash } from 'node:crypto';

const digests = new WeakMap<object, string>();

/**
 * Stable incremental-build cache key for an API reference document.
 *
 * Every page generated from a package or module document returns this value
 * from `getStaticPaths()`, so Astro can reuse a page from the previous build
 * as long as the document it was rendered from (and the template code) is
 * unchanged. The digest is memoized per document object.
 */
export function apiDocumentCacheKey(document: object): string {
  let digest = digests.get(document);
  if (!digest) {
    digest = createHash('sha1').update(JSON.stringify(document)).digest('base64url');
    digests.set(document, digest);
  }
  return digest;
}

/** Adds the owning document's cache key to every path whose props carry a `packageName`. */
export function withApiCacheKeys<T extends { props: { packageName: string } }>(
  paths: T[],
  documents: ReadonlyArray<{ data: { package: { name: string } } }>
): Array<T & { cacheKey: string }> {
  const keys = new Map(documents.map(({ data }) => [data.package.name, apiDocumentCacheKey(data)]));
  return paths.map((path) => ({ ...path, cacheKey: keys.get(path.props.packageName)! }));
}
