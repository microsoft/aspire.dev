import { beforeEach, expect, test, vi } from 'vitest';

const { getCollection } = vi.hoisted(() => ({
  getCollection: vi.fn(),
}));
vi.mock('astro:content', () => ({ getCollection }));

const documents: Record<string, Array<{ data: { package: { name: string }; types?: object[] } }>> = {
  packages: [{ data: { package: { name: 'Aspire.Hosting.Redis' }, types: [{ name: 'RedisResource' }] } }],
  tsModules: [{ data: { package: { name: 'Aspire.Hosting.Redis' } } }],
  goModules: [{ data: { package: { name: 'Aspire.Hosting.Valkey' } } }],
};

beforeEach(() => {
  vi.resetModules();
  getCollection.mockReset();
  getCollection.mockImplementation((name: string, filter?: (entry: unknown) => boolean) =>
    Promise.resolve(filter ? documents[name].filter(filter) : documents[name])
  );
});

test.each([
  ['csharp', '/reference/api/csharp/aspire.hosting.redis/redisresource/properties/', 'packages'],
  ['typescript', '/reference/api/typescript/aspire.hosting.redis/addredis/', 'tsModules'],
  ['go', '/reference/api/go/aspire.hosting.valkey/', 'goModules'],
] as const)('%s tree URLs are versioned with the payload content hash', async (language, pathname, collection) => {
  const { getApiSidebarTreeSrc } = await import('../../src/utils/api-sidebar-tree-src');
  const { apiDocumentCacheKey } = await import('../../src/utils/api-cache-key');
  const slug = pathname.split('/')[4];

  expect(await getApiSidebarTreeSrc(pathname, '/base')).toBe(
    `/base/reference/api/${language}/${slug}/sidebar.json?v=${apiDocumentCacheKey(documents[collection][0].data)}`
  );
});

test('landing pages and unknown packages have no tree URL', async () => {
  const { getApiSidebarTreeSrc } = await import('../../src/utils/api-sidebar-tree-src');

  expect(await getApiSidebarTreeSrc('/reference/api/csharp/')).toBeUndefined();
  expect(await getApiSidebarTreeSrc('/reference/api/go/aspire.hosting.unknown/')).toBeUndefined();
});
