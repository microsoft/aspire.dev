import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadCacheKeys(commit: string, repoUrl = 'https://github.com/microsoft/aspire.dev') {
  vi.stubEnv('PUBLIC_GIT_COMMIT_ID', commit);
  vi.stubEnv('PUBLIC_REPO_URL', repoUrl);
  vi.resetModules();
  return import('../../src/utils/api-cache-key');
}

describe('API incremental cache deployment identity', () => {
  const document = { package: { name: 'Aspire.Hosting.Redis' }, types: [] };

  test('retains the same key for unchanged data and deployment', async () => {
    const first = await loadCacheKeys('build-a');
    const key = first.apiDocumentCacheKey(document);
    expect(first.apiDocumentCacheKey(document)).toBe(key);
    expect(first.apiDocumentCacheKey(structuredClone(document))).toBe(key);
    const second = await loadCacheKeys('build-a');
    expect(second.apiDocumentCacheKey(document)).toBe(key);
    expect(second.apiDocumentCacheKey({ ...document, types: ['RedisResource'] })).not.toBe(key);
  });

  test('invalidates unchanged API data when the deployment changes', async () => {
    const first = await loadCacheKeys('build-a');
    const oldKey = first.apiDocumentCacheKey(document);
    const second = await loadCacheKeys('build-b');
    expect(second.apiDocumentCacheKey(document)).not.toBe(oldKey);
  });

  test('invalidates source links when the repository changes, ignoring a trailing slash', async () => {
    const first = await loadCacheKeys('build-a');
    const oldKey = first.apiDocumentCacheKey(document);
    const equivalent = await loadCacheKeys('build-a', 'https://github.com/microsoft/aspire.dev/');
    expect(equivalent.apiDocumentCacheKey(document)).toBe(oldKey);
    const changed = await loadCacheKeys('build-a', 'https://github.com/example/docs');
    expect(changed.apiDocumentCacheKey(document)).not.toBe(oldKey);
  });

  test('applies deployment-aware keys to every path for the owning package', async () => {
    const { apiDocumentCacheKey, withApiCacheKeys } = await loadCacheKeys('build-a');
    const paths = ['type', 'member'].map((name) => ({
      params: { name },
      props: { packageName: document.package.name },
    }));
    const result = withApiCacheKeys(paths, [{ data: document }]);
    expect(result).toEqual(paths.map((path) => ({
      ...path,
      cacheKey: apiDocumentCacheKey(document),
    })));
  });

  test('shares the head metadata fallback values', async () => {
    await loadCacheKeys('');
    vi.stubEnv('GIT_COMMIT_ID', 'fallback-build');
    vi.stubEnv('PUBLIC_REPO_URL', '');
    vi.stubEnv('REPO_URL', 'https://github.com/example/docs/');
    vi.resetModules();
    const { deploymentMetadata } = await import('../../src/utils/deployment-metadata');
    expect(deploymentMetadata).toEqual({
      commit: 'fallback-build',
      repoUrl: 'https://github.com/example/docs',
    });
  });
});
