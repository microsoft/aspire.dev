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

const packageName = 'Aspire.Hosting.Azure.Provisioning.Network';
const modulePath = '/reference/api/typescript/aspire.hosting.azure.provisioning.network/';

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
    { data: module(packageName) },
  ]);
  const { getTsApiReferenceSidebar } = await import('../../src/utils/ts-api-sidebar');

  expect(await getTsApiReferenceSidebar()).toEqual([
    { label: 'Search TypeScript APIs', link: '/reference/api/typescript/' },
    { label: packageName, link: modulePath },
    { label: 'Aspire.Hosting.Redis', link: '/reference/api/typescript/aspire.hosting.redis/' },
  ]);
  expect(getCollection).toHaveBeenCalledTimes(1);
});

test('the module overview sidebar links to catalog sections instead of duplicating the catalog', async () => {
  const { getTsApiReferenceSidebar } = await import('../../src/utils/ts-api-sidebar');
  const sidebar = await getTsApiReferenceSidebar({
    packageName,
    headings: [
      { slug: 'types', text: 'Types' },
      { slug: 'functions', text: 'Functions' },
      { slug: 'enums', text: 'Enums' },
    ],
  });

  expect(links(sidebar)).toEqual([
    '/reference/api/typescript/',
    modulePath,
    `${modulePath}#types`,
    `${modulePath}#functions`,
    `${modulePath}#enums`,
  ]);
  expect(getCollection).not.toHaveBeenCalled();
});

test.each([
  { name: 'VirtualNetworkProxy', slug: 'virtualnetworkproxy', sections: ['properties', 'methods'] },
  { name: 'NetworkOptions', slug: 'networkoptions', sections: ['fields'] },
  { name: 'AddressPrefixType', slug: 'addressprefixtype', sections: ['values'] },
  { name: 'addVirtualNetwork', slug: 'addvirtualnetwork', sections: ['signature', 'applies-to'] },
  { name: 'EmptyType', slug: 'emptytype', sections: [] },
])('item sidebar contains only $name and its actual sections', async ({ name, slug, sections }) => {
  const { getTsApiReferenceSidebar } = await import('../../src/utils/ts-api-sidebar');
  const sidebar = await getTsApiReferenceSidebar({
    packageName,
    item: { name, slug },
    headings: sections.map((section) => ({ slug: section, text: section })),
  });

  expect(links(sidebar)).toEqual([
    '/reference/api/typescript/',
    modulePath,
    `${modulePath}${slug}/`,
    ...sections.map((section) => `${modulePath}${slug}/#${section}`),
  ]);
  expect(links(sidebar).length).toBeLessThanOrEqual(5);
  expect(JSON.stringify(sidebar).length).toBeLessThan(1024);
  expect(getCollection).not.toHaveBeenCalled();
});

test('member sidebars preserve the exact parent and overloaded member route slugs', async () => {
  const { getTsApiReferenceSidebar } = await import('../../src/utils/ts-api-sidebar');
  const item = { name: 'Resource', slug: 'resource-qualified-name' };
  const member = { name: 'Configure', slug: 'configure-resource-string' };
  const headings = [{ slug: 'signature', text: 'Signature' }, { slug: 'defined-on', text: 'Defined on' }];
  const sidebar = await getTsApiReferenceSidebar({ packageName, item, member, headings });
  const parentPath = `${modulePath}${item.slug}/`;
  const memberPath = `${parentPath}${member.slug}/`;

  expect(links(sidebar)).toEqual([
    '/reference/api/typescript/',
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
    const { getTsApiReferenceSidebar } = await import('../../src/utils/ts-api-sidebar');
    const first = getTsApiReferenceSidebar();
    expect(getTsApiReferenceSidebar()).toBe(first);
    expect(links(await first)).toEqual(['/reference/api/typescript/', modulePath]);
    expect(getCollection).toHaveBeenCalledTimes(1);
  });

  test('keeps local trees isolated without retaining one cache entry per generated page', async () => {
    const { getTsApiReferenceSidebar } = await import('../../src/utils/ts-api-sidebar');
    const options = {
      packageName,
      item: { name: 'Resource', slug: 'resource' },
      member: { name: 'Configure', slug: 'configure-string' },
      headings: [{ slug: 'signature', text: 'Signature' }],
    };
    const first = getTsApiReferenceSidebar(options);
    expect(getTsApiReferenceSidebar(options)).not.toBe(first);
    const original = await first;
    const snapshot = structuredClone(original);

    const alternate = await getTsApiReferenceSidebar({
      ...options,
      member: { name: 'Configure', slug: 'configure-number' },
    });
    const otherItem = await getTsApiReferenceSidebar({
      ...options,
      item: { name: 'AnotherResource', slug: 'anotherresource' },
    });
    const otherModule = await getTsApiReferenceSidebar({
      ...options,
      packageName: 'Aspire.Hosting.Redis',
    });
    const module = await getTsApiReferenceSidebar({ packageName, headings: [] });

    expect(original).toEqual(snapshot);
    expect(alternate).not.toBe(original);
    expect(otherItem).not.toBe(original);
    expect(otherModule).not.toBe(original);
    expect(module).not.toBe(original);
    expect(links(alternate)).toContain(`${modulePath}resource/configure-number/`);
    expect(links(otherItem)).toContain(`${modulePath}anotherresource/configure-string/`);
    expect(links(otherModule)).toContain('/reference/api/typescript/aspire.hosting.redis/resource/configure-string/');
    expect(getCollection).not.toHaveBeenCalled();
  });
});
