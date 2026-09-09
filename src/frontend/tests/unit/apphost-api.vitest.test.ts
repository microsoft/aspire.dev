import { describe, expect, test } from 'vitest';

import {
  getAppHostItemSlug,
  getAppHostMemberSlug,
  getAppHostTopLevelItems,
} from '../../src/utils/apphost-api-routes';
import {
  getAppHostTypeScriptHtmlTarget,
  getAppHostTypeScriptMarkdownTarget,
  getAppHostTypeScriptRouteAliases,
} from '../../src/utils/apphost-typescript-route-aliases';
import { renderAppHostItemMarkdown } from '../../src/utils/apphost-api-markdown';
import { buildAppHostApiSearchIndex } from '../../src/utils/apphost-api-search';
import { getAppHostApiSearchStats } from '../../src/utils/apphost-api-search-stats';
import aliasManifest from '../../src/data/apphost-typescript-route-aliases.json';
import {
  type AppHostApiItem,
  type AppHostApiProjection,
  type AppHostModuleDocument,
  getCapabilitiesForHandle,
  projectAppHostModule,
  resolveAppHostCapabilityLanguageSupport,
  resolveAppHostPackageLanguageSupport,
} from '../../src/utils/apphost-modules';
import {
  getAppHostLanguages,
  type AppHostLanguageId,
} from '../../src/utils/apphost-languages';

const languageIdentifiers: Partial<Record<AppHostLanguageId, string>> = {
  typescript: 'withWidget',
  python: 'with_widget',
  go: 'WithWidget',
  java: 'withWidget',
  rust: 'with_widget',
};

function projections(
  overrides: Partial<Record<AppHostLanguageId, Partial<AppHostApiProjection>>> = {}
): Partial<Record<AppHostLanguageId, AppHostApiProjection>> {
  return Object.fromEntries(
    Object.entries(languageIdentifiers).map(([language, identifier]) => [
      language,
      {
        status: 'supported',
        validation: 'source-derived',
        identifier,
        declaration: `${identifier}()`,
        sourceFile: `widget.${language}`,
        ...overrides[language],
      },
    ])
  );
}

function createDocument(): AppHostModuleDocument {
  const handle: AppHostApiItem = {
    id: 'Sample/Sample.WidgetResource',
    kind: 'handle',
    name: 'WidgetResource',
    fullName: 'Sample.WidgetResource',
    projections: projections({
      typescript: { identifier: 'WidgetResource', kind: 'interface' },
      python: { identifier: 'WidgetResource', kind: 'class' },
      go: { identifier: 'WidgetResource', kind: 'interface' },
      java: { identifier: 'WidgetResource', kind: 'class' },
      rust: { identifier: 'WidgetResource', kind: 'handle' },
    }),
  };
  const method: AppHostApiItem = {
    id: 'Sample/withWidget',
    capabilityId: 'Sample/withWidget',
    kind: 'capability',
    name: 'withWidget',
    qualifiedName: 'WidgetResource.withWidget',
    capabilityKind: 'Method',
    targetTypeId: 'Sample/Sample.WidgetResource',
    description: 'Configures the widget.',
    parameters: [{ name: 'enabled', type: 'boolean', defaultValue: 'true' }],
    projections: projections({
      java: {
        identifier: 'withWidget',
        reason: 'Union inputs use generated concrete overloads.',
      },
      rust: {
        status: 'unsupported',
        identifier: undefined,
        declaration: undefined,
        reason: 'Callback defaults cannot be represented faithfully.',
      },
    }),
  };
  const standalone: AppHostApiItem = {
    ...method,
    id: 'Sample/addWidget',
    capabilityId: 'Sample/addWidget',
    name: 'addWidget',
    qualifiedName: 'addWidget',
    targetTypeId: undefined,
    projections: projections({
      typescript: { identifier: 'addWidget' },
      python: { identifier: 'add_widget' },
      go: { identifier: 'AddWidget' },
      java: { identifier: 'addWidget' },
      rust: { identifier: 'add_widget' },
    }),
  };

  return {
    schemaVersion: '1.0',
    generatorProvenance: {
      repository: 'microsoft/aspire',
      commit: '62028348b5d02dfc8f8baf03a4472946537b0d16',
      lockFile: 'upstream-sources.lock.json',
    },
    package: { name: 'Aspire.Hosting.Sample', version: '1.0.0' },
    items: [handle, method, standalone],
  };
}

describe('semantic AppHost API data', () => {
  test('projects one semantic document independently for each language', () => {
    const document = createDocument();

    expect(projectAppHostModule(document, 'typescript').functions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'withWidget' })])
    );
    expect(projectAppHostModule(document, 'python').functions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'with_widget' })])
    );
    expect(projectAppHostModule(document, 'go').functions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'WithWidget' })])
    );
    expect(projectAppHostModule(document, 'rust').functions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'Sample/withWidget' })])
    );
  });

  test('resolves C# member names to generated language support', () => {
    const support = resolveAppHostCapabilityLanguageSupport(createDocument(), 'WithWidget');

    expect(support).toMatchObject({
      csharpMemberName: 'WithWidget',
      itemIds: ['Sample/withWidget'],
      languages: {
        typescript: { status: 'supported', identifier: 'withWidget' },
        python: { status: 'supported', identifier: 'with_widget' },
        go: { status: 'supported', identifier: 'WithWidget' },
        java: {
          status: 'supported',
          identifier: 'withWidget',
          reason: 'Union inputs use generated concrete overloads.',
        },
        rust: {
          status: 'unsupported',
          reason: 'Callback defaults cannot be represented faithfully.',
        },
      },
    });
  });

  test('summarizes package support independently of activation state', () => {
    const support = resolveAppHostPackageLanguageSupport(createDocument());

    expect(support.languages.python).toMatchObject({
      status: 'supported',
      supportedItems: 3,
      totalItems: 3,
    });
    expect(support.languages.rust).toMatchObject({
      status: 'limited',
      supportedItems: 2,
      totalItems: 3,
      reasons: ['Callback defaults cannot be represented faithfully.'],
    });
  });

  test('indexes standalone APIs once and handle-only members at canonical language URLs', () => {
    const document = createDocument();
    const generatedLanguages = getAppHostLanguages()
      .filter((language) => language.generatedApi)
      .map((language) => language.id);
    const index = buildAppHostApiSearchIndex([document], '', generatedLanguages);

    expect(index.filter((entry) => entry.l === 'typescript' && entry.n === 'addWidget')).toHaveLength(1);
    expect(index).toContainEqual(
      expect.objectContaining({
        n: 'with_widget',
        l: 'python',
        t: 'WidgetResource',
        m: true,
        h: '/reference/api/apphost/aspire.hosting.sample/widgetresource/withwidget/?aspire-lang=python',
      })
    );
    expect(index.some((entry) => entry.l === 'rust' && entry.n === 'with_widget' && entry.m)).toBe(false);
    expect(getAppHostApiSearchStats(index, 'python')).toEqual({
      packageCount: 1,
      capabilityCount: 2,
      typeCount: 1,
    });
  });

  test('renders every enabled projection or its explicit unsupported reason in markdown', () => {
    const document = createDocument();
    const method = document.items.find((item) => item.id === 'Sample/withWidget');
    expect(method).toBeDefined();

    const generatedLanguages = getAppHostLanguages().filter((language) => language.generatedApi);
    const markdown = renderAppHostItemMarkdown(document, method!, '', generatedLanguages);

    expect(markdown).toContain('## TypeScript');
    expect(markdown).toContain('## Python');
    expect(markdown).toContain('## Go');
    expect(markdown).toContain('## Java');
    expect(markdown).toContain('## Rust');
    expect(markdown).toContain('Limitation: Union inputs use generated concrete overloads.');
    expect(markdown).toContain('Unsupported: Callback defaults cannot be represented faithfully.');
  });

  test('keeps overloaded member routes unique while using stable TypeScript identifiers', () => {
    const document = createDocument();
    const handle = document.items[0];
    const members = getCapabilitiesForHandle(document, handle);
    const overload = structuredClone(members[0]);
    overload.id = 'Sample/withWidget:string';
    overload.parameters = [{ name: 'name', type: 'string' }];
    document.items.push(overload);
    const siblings = getCapabilitiesForHandle(document, handle);

    expect(getAppHostMemberSlug(siblings[0], siblings, handle.name)).not.toBe(
      getAppHostMemberSlug(siblings[1], siblings, handle.name)
    );
    expect(getAppHostItemSlug(handle, getAppHostTopLevelItems(document))).toBe('widgetresource');
  });

  test('preserves the complete pre-migration TypeScript route inventory', () => {
    const aliases = [
      ...getAppHostTypeScriptRouteAliases(1),
      ...getAppHostTypeScriptRouteAliases(2),
      ...getAppHostTypeScriptRouteAliases(3),
    ];

    expect(aliasManifest.legacyRouteCount).toBe(3633);
    expect(aliases).toHaveLength(aliasManifest.legacyRouteCount);
    expect(new Set(aliases.map((alias) => alias.source)).size).toBe(
      aliasManifest.legacyRouteCount
    );
    expect(aliases.every((alias) => alias.target.startsWith('/reference/api/apphost/'))).toBe(true);
    expect(getAppHostTypeScriptHtmlTarget(aliases[0].target).endsWith(
      '?aspire-lang=typescript'
    )).toBe(true);
    expect(getAppHostTypeScriptMarkdownTarget(aliases[0].target).endsWith('.md')).toBe(true);
  });
});
