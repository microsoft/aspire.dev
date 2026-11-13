import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { getCollection } = vi.hoisted(() => ({
  getCollection: vi.fn(),
}));
vi.mock('astro:content', () => ({ getCollection }));

type SidebarItem = { label: string; link: string } | {
  label: string;
  collapsed: boolean;
  items: SidebarItem[];
};

function links(items: SidebarItem[]): string[] {
  return items.flatMap((item) => 'link' in item ? [item.link] : links(item.items));
}

const packageName = 'Aspire.Hosting.Redis';
const modulePath = '/reference/api/go/aspire.hosting.redis/';

beforeEach(() => {
  vi.resetModules();
  getCollection.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('the global sidebar lists modules without traversing their catalogs', async () => {
  const module = (name: string) => ({
    package: { name },
    get handleTypes(): never { throw new Error('Do not expand the module catalog in a sidebar.'); },
    get dtoTypes(): never { throw new Error('Do not expand the module catalog in a sidebar.'); },
    get enumTypes(): never { throw new Error('Do not expand the module catalog in a sidebar.'); },
    get functions(): never { throw new Error('Do not expand the module catalog in a sidebar.'); },
  });
  getCollection.mockResolvedValue([
    { data: module('Aspire.Hosting.Redis') },
    { data: module('Aspire.Hosting') },
  ]);
  const { getGoApiReferenceSidebar } = await import('../../src/utils/go-api-sidebar');

  expect(await getGoApiReferenceSidebar()).toEqual([
    { label: 'Search Go APIs', link: '/reference/api/go/' },
    { label: 'Aspire.Hosting', link: '/reference/api/go/aspire.hosting/' },
    { label: packageName, link: modulePath },
  ]);
  expect(getCollection).toHaveBeenCalledTimes(1);
  expect(getCollection).toHaveBeenCalledWith('goModules');
});

test('the module overview sidebar links to catalog sections instead of duplicating the catalog', async () => {
  const { getGoApiReferenceSidebar } = await import('../../src/utils/go-api-sidebar');
  const sidebar = await getGoApiReferenceSidebar({
    packageName,
    headings: [
      { slug: 'handles', text: 'Handles' },
      { slug: 'functions', text: 'Functions' },
      { slug: 'enums', text: 'Enums' },
    ],
  });

  expect(links(sidebar)).toEqual([
    '/reference/api/go/',
    modulePath,
    `${modulePath}#handles`,
    `${modulePath}#functions`,
    `${modulePath}#enums`,
  ]);
  expect(getCollection).not.toHaveBeenCalled();
});

test.each([
  { name: 'RedisResource', slug: 'redisresource', sections: ['properties', 'methods'] },
  { name: 'RedisModule', slug: 'redismodule', sections: ['fields'] },
  { name: 'RedisMode', slug: 'redismode', sections: ['values'] },
  { name: 'AddRedis', slug: 'addredis', sections: ['parameters', 'returns', 'applies-to'] },
  { name: 'EmptyType', slug: 'emptytype', sections: [] },
])('item sidebar contains only $name and its actual sections', async ({ name, slug, sections }) => {
  const { getGoApiReferenceSidebar } = await import('../../src/utils/go-api-sidebar');
  const sidebar = await getGoApiReferenceSidebar({
    packageName,
    item: { name, slug },
    headings: sections.map((section) => ({ slug: section, text: section })),
  });

  expect(links(sidebar)).toEqual([
    '/reference/api/go/',
    modulePath,
    `${modulePath}${slug}/`,
    ...sections.map((section) => `${modulePath}${slug}/#${section}`),
  ]);
  expect(links(sidebar).length).toBeLessThanOrEqual(6);
  expect(JSON.stringify(sidebar).length).toBeLessThan(1024);
  expect(getCollection).not.toHaveBeenCalled();
});

test('member sidebars preserve the exact parent and overloaded member route slugs', async () => {
  const { getGoApiReferenceSidebar } = await import('../../src/utils/go-api-sidebar');
  const item = { name: 'RedisResource', slug: 'redisresource' };
  const member = { name: 'WithModule', slug: 'withmodule-redisresource-string' };
  const headings = [{ slug: 'signature', text: 'Signature' }, { slug: 'defined-on', text: 'Defined on' }];
  const sidebar = await getGoApiReferenceSidebar({ packageName, item, member, headings });
  const parentPath = `${modulePath}${item.slug}/`;
  const memberPath = `${parentPath}${member.slug}/`;

  expect(links(sidebar)).toEqual([
    '/reference/api/go/',
    modulePath,
    parentPath,
    memberPath,
    `${memberPath}#signature`,
    `${memberPath}#defined-on`,
  ]);
  expect(getCollection).not.toHaveBeenCalled();
});

describe('production sidebars', () => {
  beforeEach(() => vi.stubEnv('PROD', true));

  test('builds the shared module index once', async () => {
    getCollection.mockResolvedValue([{ data: { package: { name: packageName } } }]);
    const { getGoApiReferenceSidebar } = await import('../../src/utils/go-api-sidebar');
    const first = getGoApiReferenceSidebar();
    expect(getGoApiReferenceSidebar()).toBe(first);
    expect(links(await first)).toEqual(['/reference/api/go/', modulePath]);
    expect(getCollection).toHaveBeenCalledTimes(1);
  });

  test('keeps local trees isolated without retaining one cache entry per generated page', async () => {
    const { getGoApiReferenceSidebar } = await import('../../src/utils/go-api-sidebar');
    const options = {
      packageName,
      item: { name: 'Resource', slug: 'resource' },
      member: { name: 'Configure', slug: 'configure-string' },
      headings: [{ slug: 'signature', text: 'Signature' }],
    };
    const first = getGoApiReferenceSidebar(options);
    expect(getGoApiReferenceSidebar(options)).not.toBe(first);
    const original = await first;
    const snapshot = structuredClone(original);

    const alternate = await getGoApiReferenceSidebar({
      ...options,
      member: { name: 'Configure', slug: 'configure-number' },
    });
    const otherItem = await getGoApiReferenceSidebar({
      ...options,
      item: { name: 'AnotherResource', slug: 'anotherresource' },
    });
    const otherModule = await getGoApiReferenceSidebar({
      ...options,
      packageName: 'Aspire.Hosting',
    });
    const module = await getGoApiReferenceSidebar({ packageName, headings: [] });

    expect(original).toEqual(snapshot);
    expect(alternate).not.toBe(original);
    expect(otherItem).not.toBe(original);
    expect(otherModule).not.toBe(original);
    expect(module).not.toBe(original);
    expect(links(alternate)).toContain(`${modulePath}resource/configure-number/`);
    expect(links(otherItem)).toContain(`${modulePath}anotherresource/configure-string/`);
    expect(links(otherModule)).toContain('/reference/api/go/aspire.hosting/resource/configure-string/');
    expect(getCollection).not.toHaveBeenCalled();
  });
});
