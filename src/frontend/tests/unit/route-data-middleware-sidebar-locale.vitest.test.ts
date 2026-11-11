import { beforeAll, expect, test, vi } from 'vitest';

vi.mock('@astrojs/starlight/route-data', () => ({
  defineRouteMiddleware: <T>(fn: T) => fn,
}));

type SidebarLink = { type: 'link'; label: string; href: string; isCurrent: boolean };
type SidebarGroup = { type: 'group'; label: string; entries: SidebarEntry[] };
type SidebarEntry = SidebarLink | SidebarGroup;
type Middleware = (context: unknown) => void;

let onRequest: Middleware;

beforeAll(async () => {
  ({ onRequest } = (await import('../../src/route-data-middleware')) as unknown as {
    onRequest: Middleware;
  });
});

const link = (href: string, isCurrent = false): SidebarLink => ({
  type: 'link',
  label: href,
  href,
  isCurrent,
});

function sidebarHrefsAfterMiddleware(pathname: string, hrefs: string[]): string[] {
  const sidebar: SidebarEntry[] = [
    {
      type: 'group',
      label: 'Get started',
      entries: [link(pathname, true), ...hrefs.map((href) => link(href))],
    },
  ];
  onRequest({
    url: new URL(pathname, 'https://aspire.dev'),
    site: new URL('https://aspire.dev'),
    locals: {
      starlightRoute: {
        id: pathname.slice(1, -1),
        entry: { id: `${pathname.slice(1, -1)}.mdx`, data: { title: 'T', description: 'D' } },
        head: [],
        sidebar,
        pagination: {},
      },
    },
  });
  return (sidebar[0] as SidebarGroup).entries.slice(1).map((entry) => (entry as SidebarLink).href);
}

test('localized sidebar links to English-only pages point at the English URL', () => {
  expect(
    sidebarHrefsAfterMiddleware('/de/get-started/install-cli/', [
      '/de/hub/glossary/',
      '/ja/hub/',
      '/zh-cn/reference/samples/aspire-shop/',
    ])
  ).toEqual(['/hub/glossary/', '/hub/', '/reference/samples/aspire-shop/']);
});

test('localized sidebar links to translated docs keep their locale', () => {
  expect(
    sidebarHrefsAfterMiddleware('/de/get-started/install-cli/', [
      '/de/get-started/resources/',
      '/de/reference/samples/',
      '/de/',
      'https://github.com/microsoft/aspire',
    ])
  ).toEqual([
    '/de/get-started/resources/',
    '/de/reference/samples/',
    '/de/',
    'https://github.com/microsoft/aspire',
  ]);
});

test('API reference sidebar links stay canonicalized', () => {
  expect(
    sidebarHrefsAfterMiddleware('/fr/get-started/install-cli/', ['/fr/reference/api/csharp/'])
  ).toEqual(['/reference/api/csharp/']);
});
