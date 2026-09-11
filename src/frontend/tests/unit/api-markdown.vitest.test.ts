/* eslint-disable
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-return
  -- route module imports and test props are intentionally dynamic in this harness
*/
import { describe, expect, it, vi } from 'vitest';

import {
  renderCSharpDocMarkdown,
  renderCSharpMemberKindMarkdown,
  renderCSharpTypeMarkdown,
} from '@utils/csharp-api-markdown';
import { memberKindSlugs, resolveMemberAnchors } from '@utils/packages';
import { renderTypeScriptItemMarkdown, renderTypeScriptModuleMarkdown } from '@utils/typescript-api-markdown';
import type { TsApiDocument, TsHandleType } from '@utils/ts-modules';
import { appHostLanguageConfig } from '@utils/apphost-languages';

vi.mock('astro:content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('astro:content')>();
  const csharpPackageModules = import.meta.glob<{ default: any }>('../../src/data/pkgs/Aspire.Hosting.*.json');
  const appHostModuleModules = import.meta.glob<{ default: any }>('../../src/data/apphost-modules/Aspire.Hosting.*.json');
  const rootHostingPackagePattern = /\/(Aspire\.Hosting\.\d[^/]*\.json)$/;
  const getRootHostingIds = (modules: Record<string, () => Promise<{ default: any }>>) =>
    Object.keys(modules)
      .map((path) => path.match(rootHostingPackagePattern)?.[1])
      .filter((id): id is string => Boolean(id));
  const csharpPackageIds = getRootHostingIds(csharpPackageModules);
  const appHostModuleIds = new Set(getRootHostingIds(appHostModuleModules));
  const commonPackageIds = csharpPackageIds
    .filter((id) => appHostModuleIds.has(id))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const fixtureId = commonPackageIds[commonPackageIds.length - 1];

  if (!fixtureId) {
    throw new Error('Expected matching Aspire.Hosting package and AppHost module fixtures.');
  }

  const [{ default: csharpPackageFixture }, { default: appHostModuleFixture }] = await Promise.all([
    csharpPackageModules[`../../src/data/pkgs/${fixtureId}`](),
    appHostModuleModules[`../../src/data/apphost-modules/${fixtureId}`](),
  ]);

  return {
    ...actual,
    // Route tests need deterministic content entries even when Astro's test-time
    // content layer comes up empty in CI.
    getCollection: async (collectionName: string) => {
      if (collectionName === 'packages') {
        return [{ id: fixtureId, data: csharpPackageFixture }];
      }

      if (collectionName === 'apphostModules') {
        return [{ id: fixtureId, data: appHostModuleFixture }];
      }

      return await actual.getCollection(collectionName);
    },
  };
});

type StaticRoute = {
  params: Record<string, string | undefined>;
  props: any;
};

type MarkdownRouteModule = {
  GET?: (context?: any) => Response | Promise<Response>;
  getStaticPaths?: () => Promise<StaticRoute[]>;
};

const routeModules = import.meta.glob<MarkdownRouteModule>('../../src/pages/reference/api/**/*.md.ts', {
  eager: true,
});

const csharpIndexRoute = getRouteModule('../../src/pages/reference/api/csharp.md.ts');
const csharpPackageRoute = getRouteModule('../../src/pages/reference/api/csharp/[package].md.ts');
const csharpTypeRoute = getRouteModule('../../src/pages/reference/api/csharp/[package]/[type].md.ts');
const csharpMemberKindRoute = getRouteModule('../../src/pages/reference/api/csharp/[package]/[type]/[memberKind].md.ts');
const appHostIndexRoute = getRouteModule('../../src/pages/reference/api/apphost.md.ts');
const appHostModuleRoute = getRouteModule('../../src/pages/reference/api/apphost/[module].md.ts');
const appHostItemRoute = getRouteModule('../../src/pages/reference/api/apphost/[module]/[item].md.ts');
const appHostMemberRoute = getRouteModule('../../src/pages/reference/api/apphost/[module]/[item]/[member].md.ts');
const typeScriptIndexRoute = getRouteModule('../../src/pages/reference/api/typescript.md.ts');
const typeScriptModuleRoute = getRouteModule('../../src/pages/reference/api/typescript/[module].md.ts');

describe('API markdown routes', () => {
  it('returns markdown for the C# API index route', async () => {
    const markdown = await readMarkdown(csharpIndexRoute.GET?.({} as any));

    expect(markdown).toContain('# C# API Reference');
    expect(markdown).toMatch(/\/reference\/api\/csharp\/[^)\s]+\.md/);
    expect(markdown).not.toContain('·');
    expect(markdown).not.toContain('—');
  });

  it('returns markdown for a C# package route', async () => {
    const route = await findStaticRoute(
      csharpPackageRoute.getStaticPaths,
      (candidate) => (candidate.props.pkg.types?.length ?? 0) > 0,
      'C# package route'
    );
    const markdown = await readMarkdown(csharpPackageRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.pkg.package.name}`);
    expect(markdown).toMatch(new RegExp(`/reference/api/csharp/${route.params.package}/[^)\\s]+\\.md`));
  });

  it('returns markdown for a C# type route', async () => {
    const route = await findStaticRoute(
      csharpTypeRoute.getStaticPaths,
      (candidate) => (candidate.props.type.members?.length ?? 0) > 0,
      'C# type route'
    );
    const memberKind = route.props.type.members.find((member: any) => member.kind)?.kind;
    const markdown = await readMarkdown(csharpTypeRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.type.name}`);
    expect(markdown).toContain('## Definition');
    expect(markdown).toContain(
      `/reference/api/csharp/${route.params.package}/${route.params.type}/${memberKindSlugs[memberKind]}.md`
    );
  });

  it('returns markdown for a C# member-kind route', async () => {
    const route = await findStaticRoute(
      csharpMemberKindRoute.getStaticPaths,
      (candidate) => candidate.props.memberKind !== 'constructor',
      'C# member-kind route'
    );
    const member = route.props.type.members.find((entry: any) => entry.kind === route.props.memberKind);
    const markdown = await readMarkdown(csharpMemberKindRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.type.name}`);
    expect(markdown).toContain(`## ${member.name}`);
    expect(markdown).toContain('```csharp');
  });

  it('returns markdown for the canonical AppHost API index route', async () => {
    const markdown = await readMarkdown(appHostIndexRoute.GET?.({} as any));

    expect(markdown).toContain('# AppHost API Reference');
    expect(markdown).toMatch(/\/reference\/api\/apphost\/[^)\s]+\.md/);
  });

  it('returns markdown for a canonical AppHost module route', async () => {
    const route = await findStaticRoute(appHostModuleRoute.getStaticPaths, () => true, 'AppHost module route');
    const markdown = await readMarkdown(appHostModuleRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.document.package.name}`);
    expect(markdown).toMatch(new RegExp(`/reference/api/apphost/${route.params.module}/[^)\\s]+\\.md`));
  });

  it('renders enabled projections for an AppHost item route', async () => {
    const route = await findStaticRoute(appHostItemRoute.getStaticPaths, () => true, 'AppHost item route');
    const markdown = await readMarkdown(appHostItemRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.item.name}`);
    for (const language of appHostLanguageConfig.languages.filter(
      (candidate) => candidate.generatedApi
    )) {
      const heading = `## ${language.label}`;
      if (language.enabled) {
        expect(markdown).toContain(heading);
      } else {
        expect(markdown).not.toContain(heading);
      }
    }
  });

  it('returns markdown for a canonical AppHost member route', async () => {
    const route = await findStaticRoute(appHostMemberRoute.getStaticPaths, () => true, 'AppHost member route');
    const markdown = await readMarkdown(appHostMemberRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.handle.name}.${route.props.member.name}`);
    expect(markdown).toContain('## TypeScript');
    expect(markdown).toContain(
      `/reference/api/apphost/${route.params.module}/${route.params.item}.md`
    );
  });

  it('preserves the TypeScript markdown endpoint as a permanent compatibility redirect', async () => {
    const response = await typeScriptIndexRoute.GET?.({} as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(308);
    expect((response as Response).headers.get('location')).toBe('/reference/api/apphost.md');
  });

  it('preserves exact TypeScript module markdown redirect semantics', async () => {
    const route = await findStaticRoute(
      typeScriptModuleRoute.getStaticPaths,
      (candidate) => candidate.params.module === 'aspire.hosting',
      'TypeScript module compatibility route'
    );
    const response = await typeScriptModuleRoute.GET?.({ props: route.props } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(308);
    expect((response as Response).headers.get('location')).toBe(
      '/reference/api/apphost/aspire.hosting.md'
    );
  });
});

describe('API markdown helpers', () => {
  it('normalizes note blockquotes to a single level', () => {
    const markdown = renderCSharpDocMarkdown(
      [
        {
          kind: 'note',
          value: 'note',
          children: [
            {
              kind: 'para',
              children: [{ kind: 'text', text: '> Keep a single quote level' }],
            },
          ],
        },
      ],
      { allTypes: [], base: '', packageName: 'Test.Package' }
    );

    expect(markdown).toBe('> **Note:**\n>\n> Keep a single quote level');
  });

  it('pins TypeScript module source links to a source commit when available', () => {
    const pkg: TsApiDocument = {
      package: {
        name: 'Aspire.Hosting',
        sourceCommit: 'abc123',
        sourceRepository: 'https://github.com/microsoft/aspire',
        version: '1.0.0',
      },
      functions: [],
      handleTypes: [],
      dtoTypes: [],
      enumTypes: [],
    };

    const markdown = renderTypeScriptModuleMarkdown(pkg, '');

    expect(markdown).toContain('[GitHub](https://github.com/microsoft/aspire/tree/abc123)');
  });

  it('pins TypeScript item source links to a source commit when available', () => {
    const item: TsHandleType = {
      name: 'IDistributedApplicationBuilder',
      isInterface: true,
      capabilities: [],
    };
    const pkg: TsApiDocument = {
      package: {
        name: 'Aspire.Hosting',
        sourceCommit: 'abc123',
        sourceRepository: 'https://github.com/microsoft/aspire',
        version: '1.0.0',
      },
      functions: [],
      handleTypes: [item],
      dtoTypes: [],
      enumTypes: [],
    };

    const markdown = renderTypeScriptItemMarkdown(pkg, item, 'handle', '');

    expect(markdown).toContain('[GitHub](https://github.com/microsoft/aspire/tree/abc123)');
  });

  it('uses resolved exact anchors for colliding C# member links and crefs', () => {
    const members = [
      {
        name: 'Run',
        kind: 'method',
        signature: 'public void Widget.Run(int value)',
        parameters: [{ name: 'value', type: 'System.Int32' }],
        returnType: 'void',
      },
      {
        name: 'Run',
        kind: 'method',
        signature: 'public void Widget.Run(params int[] values)',
        parameters: [{ name: 'values', type: 'System.Int32[]', modifier: 'params' }],
        returnType: 'void',
      },
    ];
    const type = {
      name: 'Widget',
      fullName: 'Sample.Widget',
      namespace: 'Sample',
      kind: 'class',
      members,
    };
    const pkg = {
      package: { name: 'Sample.Package', version: '1.0.0' },
      types: [type],
    };
    const anchors = resolveMemberAnchors(members);

    const typeMarkdown = renderCSharpTypeMarkdown(pkg, type, [type], '');
    expect(typeMarkdown).toContain(`methods.md#${anchors[0].exact}`);
    expect(typeMarkdown).toContain(`methods.md#${anchors[1].exact}`);

    const memberMarkdown = renderCSharpMemberKindMarkdown(pkg, type, 'method', [type], '');
    expect(memberMarkdown).toContain(`<a id="${anchors[0].exact}"></a>`);
    expect(memberMarkdown).toContain(`<a id="${anchors[1].exact}"></a>`);
    expect(memberMarkdown).toContain(`<a id="${anchors[0].aliases[0]}"></a>`);

    const crefMarkdown = renderCSharpDocMarkdown(
      [{ kind: 'cref', value: 'M:Sample.Widget.Run(System.Int32)' }],
      { allTypes: [type], base: '', packageName: pkg.package.name }
    );
    expect(crefMarkdown).toContain(`methods.md#${anchors[0].exact}`);
  });
});

function getRouteModule(path: string): MarkdownRouteModule {
  const routeModule = routeModules[path];

  if (!routeModule?.GET) {
    throw new Error(`Missing API markdown route module: ${path}`);
  }

  return routeModule;
}

async function readMarkdown(responsePromise: Response | Promise<Response> | undefined): Promise<string> {
  if (!responsePromise) {
    throw new Error('Expected route to return a markdown response.');
  }

  const response = await responsePromise;

  expect(response.headers.get('content-type')).toContain('text/markdown');
  return response.text();
}

async function findStaticRoute(
  getStaticPaths: MarkdownRouteModule['getStaticPaths'],
  predicate: (route: StaticRoute) => boolean,
  label: string
): Promise<StaticRoute> {
  if (!getStaticPaths) {
    throw new Error(`Missing getStaticPaths for ${label}.`);
  }

  const routes = await getStaticPaths();
  const route = routes.find(predicate);

  expect(route, `Expected a representative ${label}.`).toBeTruthy();
  return route as StaticRoute;
}
