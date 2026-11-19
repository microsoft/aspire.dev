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

const packageName = 'Aspire.Hosting.Kubernetes';
const packagePath = '/reference/api/csharp/aspire.hosting.kubernetes/';

const ingress = {
  name: 'IngressBackendV1',
  namespace: 'Aspire.Hosting.Kubernetes.Resources',
  kind: 'class',
  members: [{ kind: 'constructor' }, { kind: 'property' }],
};
const resource = {
  name: 'KubernetesResource',
  namespace: 'Aspire.Hosting.Kubernetes',
  kind: 'class',
  members: [{ kind: 'method' }],
};
const marker = { name: 'IMarker', namespace: 'Aspire.Hosting.Kubernetes', kind: 'interface' };

function packageDocument(name: string, types: object[]) {
  return { package: { name }, types };
}

const kubernetes = packageDocument(packageName, [ingress, resource, marker]);

beforeEach(() => {
  vi.resetModules();
  getCollection.mockReset();
  getCollection.mockImplementation((_name: string, filter?: (entry: unknown) => boolean) => {
    const entries = [
      { data: packageDocument('Aspire.Hosting.Redis', [{ ...resource, namespace: 'Aspire.Hosting' }]) },
      { data: kubernetes },
    ];
    return Promise.resolve(filter ? entries.filter(filter) : entries);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('the landing sidebar links to packages without embedding their type trees', async () => {
  const { getApiReferenceSidebar } = await import('../../src/utils/api-sidebar');

  expect(await getApiReferenceSidebar()).toEqual([
    { label: 'Search APIs', link: '/reference/api/csharp/' },
    { label: packageName, link: packagePath },
    { label: 'Aspire.Hosting.Redis', link: '/reference/api/csharp/aspire.hosting.redis/' },
  ]);
});

test('the package overview spine only links to the overview', async () => {
  const { getApiReferenceSidebar } = await import('../../src/utils/api-sidebar');

  expect(await getApiReferenceSidebar({ packageName })).toEqual([
    { label: 'Search APIs', link: '/reference/api/csharp/' },
    { label: packageName, collapsed: false, items: [{ label: 'Overview', link: packagePath }] },
  ]);
});

test('a type spine expands only the current type under its namespace', async () => {
  const { getApiReferenceSidebar } = await import('../../src/utils/api-sidebar');
  const sidebar = await getApiReferenceSidebar({ packageName, type: ingress as never });

  expect(sidebar[1]).toEqual({
    label: packageName,
    collapsed: false,
    items: [
      { label: 'Overview', link: packagePath },
      {
        label: 'Aspire.Hosting.Kubernetes.Resources',
        collapsed: false,
        items: [{
          label: 'IngressBackendV1',
          collapsed: false,
          items: [
            { label: 'Overview', link: `${packagePath}ingressbackendv1/` },
            { label: 'Constructors', link: `${packagePath}ingressbackendv1/constructors/` },
            { label: 'Properties', link: `${packagePath}ingressbackendv1/properties/` },
          ],
        }],
      },
    ],
  });
  expect(links(sidebar)).not.toContain(`${packagePath}kubernetesresource/`);
});

test('a marker interface spine is a plain link, not a namespace group', async () => {
  const { getApiReferenceSidebar } = await import('../../src/utils/api-sidebar');
  const [, pkg] = (await getApiReferenceSidebar({ packageName, type: marker as never })) as never as [
    unknown,
    { items: unknown[] },
  ];

  expect(pkg.items).toEqual([
    { label: 'Overview', link: packagePath },
    { label: 'IMarker', link: `${packagePath}imarker/` },
  ]);
});

test('the compact package tree holds every type link relative to the package', async () => {
  const { buildCompactPackageSidebarTree, buildPackageSidebarItems } = await import('../../src/utils/api-sidebar');

  expect(buildCompactPackageSidebarTree(kubernetes as never)).toEqual([
    ['Overview', ''],
    ['Aspire.Hosting.Kubernetes', [
      ['IMarker', 'imarker/'],
      ['KubernetesResource', [
        ['Overview', 'kubernetesresource/'],
        ['Methods', 'kubernetesresource/methods/'],
      ]],
    ]],
    ['Aspire.Hosting.Kubernetes.Resources', [
      ['IngressBackendV1', [
        ['Overview', 'ingressbackendv1/'],
        ['Constructors', 'ingressbackendv1/constructors/'],
        ['Properties', 'ingressbackendv1/properties/'],
      ]],
    ]],
  ]);
  // Every spine link must also exist in the full tree that replaces it.
  const { getApiReferenceSidebar } = await import('../../src/utils/api-sidebar');
  const spine = await getApiReferenceSidebar({ packageName, type: ingress as never });
  const fullTree = links(buildPackageSidebarItems(kubernetes as never));
  expect(fullTree).toEqual(expect.arrayContaining(links(spine).slice(1)));
});

describe('production sidebars', () => {
  beforeEach(() => vi.stubEnv('PROD', true));

  test('memoizes only the shared landing index', async () => {
    const { getApiReferenceSidebar } = await import('../../src/utils/api-sidebar');
    const first = getApiReferenceSidebar();
    expect(getApiReferenceSidebar()).toBe(first);
    expect(getApiReferenceSidebar({ packageName })).not.toBe(getApiReferenceSidebar({ packageName }));
  });
});
