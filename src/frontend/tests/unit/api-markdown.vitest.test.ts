/* eslint-disable
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-return
  -- route module imports and test props are intentionally dynamic in this harness
*/
import { describe, expect, it, vi } from 'vitest';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { selectAll } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';

import { escapeTableCell } from '@utils/api-markdown-shared';
import {
  renderCSharpDocMarkdown,
  renderCSharpMemberKindMarkdown,
  renderCSharpTypeMarkdown,
} from '@utils/csharp-api-markdown';
import { memberKindSlugs, resolveMemberAnchors } from '@utils/packages';
import { tsSlugify } from '@utils/ts-modules';
import { renderTypeScriptItemMarkdown, renderTypeScriptModuleMarkdown } from '@utils/typescript-api-markdown';
import type { TsApiDocument, TsHandleType } from '@utils/ts-modules';

vi.mock('astro:content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('astro:content')>();
  const csharpPackageModules = import.meta.glob<{ default: any }>('../../src/data/pkgs/Aspire.Hosting.*.json');
  const typeScriptModuleModules = import.meta.glob<{ default: any }>('../../src/data/ts-modules/Aspire.Hosting.*.json');
  const rootHostingPackagePattern = /\/(Aspire\.Hosting\.\d[^/]*\.json)$/;
  const getRootHostingIds = (modules: Record<string, () => Promise<{ default: any }>>) =>
    Object.keys(modules)
      .map((path) => path.match(rootHostingPackagePattern)?.[1])
      .filter((id): id is string => Boolean(id));
  const csharpPackageIds = getRootHostingIds(csharpPackageModules);
  const typeScriptModuleIds = new Set(getRootHostingIds(typeScriptModuleModules));
  const commonPackageIds = csharpPackageIds
    .filter((id) => typeScriptModuleIds.has(id))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const fixtureId = commonPackageIds[commonPackageIds.length - 1];

  if (!fixtureId) {
    throw new Error('Expected matching Aspire.Hosting package and TypeScript module fixtures.');
  }

  const [{ default: csharpPackageFixture }, { default: typeScriptModuleFixture }] = await Promise.all([
    csharpPackageModules[`../../src/data/pkgs/${fixtureId}`](),
    typeScriptModuleModules[`../../src/data/ts-modules/${fixtureId}`](),
  ]);

  return {
    ...actual,
    // Route tests need deterministic content entries even when Astro's test-time
    // content layer comes up empty in CI.
    getCollection: async (collectionName: string) => {
      if (collectionName === 'packages') {
        return [{ id: fixtureId, data: csharpPackageFixture }];
      }

      if (collectionName === 'tsModules') {
        return [{ id: fixtureId, data: typeScriptModuleFixture }];
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
const typeScriptIndexRoute = getRouteModule('../../src/pages/reference/api/typescript.md.ts');
const typeScriptModuleRoute = getRouteModule('../../src/pages/reference/api/typescript/[module].md.ts');
const typeScriptItemRoute = getRouteModule('../../src/pages/reference/api/typescript/[module]/[item].md.ts');
const typeScriptMemberRoute = getRouteModule('../../src/pages/reference/api/typescript/[module]/[item]/[member].md.ts');

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

  it('returns markdown for the TypeScript API index route', async () => {
    const markdown = await readMarkdown(typeScriptIndexRoute.GET?.({} as any));

    expect(markdown).toContain('# TypeScript API Reference');
    expect(markdown).toMatch(/\/reference\/api\/typescript\/[^)\s]+\.md/);
    expect(markdown).not.toContain('·');
    expect(markdown).not.toContain('—');
  });

  it('returns markdown for a TypeScript module route', async () => {
    const route = await findStaticRoute(
      typeScriptModuleRoute.getStaticPaths,
      () => true,
      'TypeScript module route'
    );
    const markdown = await readMarkdown(typeScriptModuleRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.pkg.package.name}`);
    expect(markdown).toMatch(new RegExp(`/reference/api/typescript/${route.params.module}/[^)\\s]+\\.md`));
  });

  it('returns markdown for a TypeScript handle route', async () => {
    const route = await findStaticRoute(
      typeScriptItemRoute.getStaticPaths,
      (candidate) =>
        candidate.props.itemKind === 'handle' &&
        candidate.props.item.capabilities?.some(
          (capability: any) => capability.kind === 'Method' || capability.kind === 'InstanceMethod'
        ),
      'TypeScript handle route'
    );
    const method = route.props.item.capabilities.find(
      (capability: any) => capability.kind === 'Method' || capability.kind === 'InstanceMethod'
    );
    const markdown = await readMarkdown(typeScriptItemRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.item.name}`);
    expect(markdown).toContain('## Methods');
    expect(markdown).toContain(
      `/reference/api/typescript/${route.params.module}/${route.params.item}/${tsSlugify(method.name)}.md`
    );
  });

  it('returns markdown for a TypeScript DTO route', async () => {
    const route = await findStaticRoute(
      typeScriptItemRoute.getStaticPaths,
      (candidate) =>
        candidate.props.itemKind === 'dto' &&
        (candidate.props.item.fields?.length ?? 0) > 0,
      'TypeScript DTO route'
    );
    const markdown = await readMarkdown(typeScriptItemRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.item.name}`);
    expect(markdown).toContain('## Fields');
  });

  it('returns markdown for a TypeScript enum route', async () => {
    const route = await findStaticRoute(
      typeScriptItemRoute.getStaticPaths,
      (candidate) =>
        candidate.props.itemKind === 'enum' &&
        (candidate.props.item.members?.length ?? 0) > 0,
      'TypeScript enum route'
    );
    const markdown = await readMarkdown(typeScriptItemRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.item.name}`);
    expect(markdown).toContain('## Values');
  });

  it('returns markdown for a TypeScript function route', async () => {
    const route = await findStaticRoute(
      typeScriptItemRoute.getStaticPaths,
      (candidate) =>
        candidate.props.itemKind === 'function' &&
        (candidate.props.item.parameters?.length ?? 0) > 0,
      'TypeScript function route'
    );
    const markdown = await readMarkdown(typeScriptItemRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.item.name}`);
    expect(markdown).toContain('## Parameters');
    expect(markdown).toContain('## Returns');
  });

  it('returns markdown for a TypeScript member route', async () => {
    const route = await findStaticRoute(
      typeScriptMemberRoute.getStaticPaths,
      () => true,
      'TypeScript member route'
    );
    const markdown = await readMarkdown(typeScriptMemberRoute.GET?.({ props: route.props } as any));

    expect(markdown).toContain(`# ${route.props.parentType.name}.${route.props.method.name}`);
    expect(markdown).toContain('## Signature');
    expect(markdown).toContain(`/reference/api/typescript/${route.params.module}/${route.params.item}.md`);
  });
});

describe('API markdown helpers', () => {
  const tableProcessor = createMarkdownProcessor({ smartypants: false, syntaxHighlight: false });

  async function renderCell(value: string) {
    const processor = await tableProcessor;
    const result = await processor.render(
      `| Value | Sentinel |\n| --- | --- |\n| ${escapeTableCell(value)} | intact |`
    );
    const tree = unified().use(rehypeParse, { fragment: true }).parse(result.code);
    expect(selectAll('tbody tr', tree)).toHaveLength(1);
    const cells = selectAll('td', tree);
    expect(cells).toHaveLength(2);
    expect(toHtml(cells[1])).toBe('<td>intact</td>');
    return toHtml(cells[0]);
  }

  it.each([0, 1, 2, 3, 4])('preserves %i literal backslashes before a pipe in a GFM cell', async (count) => {
    const value = `left${'\\'.repeat(count)}|right`;
    expect(await renderCell(value)).toBe(`<td>${value}</td>`);
  });

  it('preserves ordinary inline code containing pipes', async () => {
    expect(await renderCell('`left|middle|right`')).toBe('<td><code>left|middle|right</code></td>');
  });

  it.each(['\r\n', '\r', '\n'])('keeps %j line endings within a single table row', async (newline) => {
    expect(await renderCell(`first${newline}second`)).toBe('<td>first<br>second</td>');
  });

  it('preserves links, emphasis, code spans and literal paths in rendered table cells', async () => {
    expect(await renderCell(
      '[API | docs](/reference/api/) **important** `C:\\src\\app` and C:\\src\\app\\'
    )).toBe(
      '<td><a href="/reference/api/">API | docs</a> <strong>important</strong> '
      + '<code>C:\\src\\app</code> and C:\\src\\app\\</td>'
    );
  });

  it('encodes repeated prose backslashes and pipes once, without changing plain code spans', async () => {
    const value = 'a\\|b\\\\|c | `C:\\src\\app` | `left|right`';
    expect(escapeTableCell(value)).toBe(
      'a\\\\\\|b\\\\\\\\\\|c \\| `C:\\src\\app` \\| `left\\|right`'
    );
    expect(await renderCell(value)).toBe(
      '<td>a\\|b\\\\|c | <code>C:\\src\\app</code> | <code>left|right</code></td>'
    );
  });

  it('preserves code backslashes when a pipe occurs elsewhere in the same span', async () => {
    expect(await renderCell('before\r\n`C:\\src | D:\\data` after\\|end')).toBe(
      '<td>before<br><code>C:\\src | D:\\data</code> after\\|end</td>'
    );
  });

  it('preserves existing Markdown escapes instead of treating the cell as raw text', async () => {
    expect(await renderCell('\\*literal\\* and \\[label\\] | `C:\\src\\app`')).toBe(
      '<td>*literal* and [label] | <code>C:\\src\\app</code></td>'
    );
  });

  it('preserves inline-code link labels and single-line code from API renderers', async () => {
    expect(await renderCell('[`left|right`](/reference/api/) and `first second`')).toBe(
      '<td><a href="/reference/api/"><code>left|right</code></a> and <code>first second</code></td>'
    );
  });

  it('preserves rich Markdown from the C# documentation table renderer', async () => {
    const markdown = renderCSharpDocMarkdown([{
      kind: 'list',
      style: 'table',
      items: [{
        term: [{ kind: 'text', text: 'path\\|name' }],
        description: [
          { kind: 'href', text: 'API | docs', value: '/reference/api/' },
          { kind: 'code', text: '%LocalAppData%\\Aspire\\BrowserData' },
        ],
      }],
    }], { allTypes: [], base: '', packageName: 'Test.Package' });
    const result = await (await tableProcessor).render(markdown);
    const tree = unified().use(rehypeParse, { fragment: true }).parse(result.code);
    expect(selectAll('tbody tr', tree)).toHaveLength(1);
    expect(selectAll('td', tree).map((node) => toHtml(node))).toEqual([
      '<td>path\\|name</td>',
      '<td><a href="/reference/api/">API | docs</a> <code>%LocalAppData%\\Aspire\\BrowserData</code></td>',
    ]);
  });

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
