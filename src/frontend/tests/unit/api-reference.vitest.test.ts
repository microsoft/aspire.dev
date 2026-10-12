import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiReferenceMocks = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock('@utils/api-reference', () => ({
  resolveApiReference: apiReferenceMocks.resolve,
}));

import ApiReference from '@components/ApiReference.astro';
import {
  buildApiReferenceIndex,
  type ApiReferencePackageDocument,
  type ApiReferenceResolution,
  type ApiReferenceTsDocument,
} from '@utils/api-reference-core';
import {
  formatApiReferenceDiagnostics,
  validateApiReferenceFiles,
  validateApiReferenceSource,
} from '@utils/api-reference-validator';
import type { TargetLanguageProvider } from '@utils/api-reference/language-provider';
import { normalizeHtml, renderComponent } from './astro-test-utils';
import { resolveMemberAnchors } from '@utils/api-member-anchors';

const EXPORT_ATTRIBUTE = 'Aspire.Hosting.AspireExportAttribute';
const EXPORT_IGNORE_ATTRIBUTE = 'Aspire.Hosting.AspireExportIgnoreAttribute';

function packageDocument(
  packageName: string,
  types: ApiReferencePackageDocument['types']
): ApiReferencePackageDocument {
  return {
    package: { name: packageName },
    types,
  };
}

function tsDocument(
  packageName: string,
  functions: ApiReferenceTsDocument['functions'] = []
): ApiReferenceTsDocument {
  return {
    package: { name: packageName },
    functions,
    handleTypes: [],
    dtoTypes: [],
    enumTypes: [],
  };
}

const widgetPackage = packageDocument('Aspire.Hosting.Widget', [
  {
    name: 'WidgetBuilderExtensions',
    fullName: 'Aspire.Hosting.WidgetBuilderExtensions',
    members: [
      {
        name: 'AddWidget',
        kind: 'method',
        isStatic: true,
        isExtension: true,
        attributes: [{ name: EXPORT_ATTRIBUTE }],
      },
    ],
  },
]);

const widgetModule = tsDocument('Aspire.Hosting.Widget', [
  {
    name: 'addWidget',
    kind: 'Method',
    capabilityId: 'Aspire.Hosting.Widget/addWidget',
    qualifiedName: 'addWidget',
  },
]);

describe('API reference index', () => {
  it('resolves a canonical FQN through precomputed C# and TypeScript indexes', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const first = index.resolve('Aspire.Hosting.WidgetBuilderExtensions.AddWidget');
    const second = index.resolve('Aspire.Hosting.WidgetBuilderExtensions.AddWidget');

    expect(first).toBe(second);
    expect(first).toMatchObject({
      status: 'resolved',
      csharp: {
        label: 'AddWidget',
        path: '/reference/api/csharp/aspire.hosting.widget/widgetbuilderextensions/methods/#addwidget',
      },
      typescript: {
        label: 'addWidget',
        path: '/reference/api/typescript/aspire.hosting.widget/addwidget/',
      },
      diagnostics: [],
    });
  });

  it('honors explicit AspireExport capability IDs and TypeScript method names', () => {
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting', [
          {
            name: 'ResourceBuilderExtensions',
            fullName: 'Aspire.Hosting.ResourceBuilderExtensions',
            members: [
              {
                name: 'WaitForCompletion',
                kind: 'method',
                isStatic: true,
                isExtension: true,
                attributes: [
                  {
                    name: EXPORT_ATTRIBUTE,
                    constructorArguments: ['waitForResourceCompletion'],
                    arguments: { MethodName: 'waitForCompletion' },
                  },
                ],
              },
            ],
          },
        ]),
      ],
      [
        tsDocument('Aspire.Hosting', [
          {
            name: 'waitForCompletion',
            kind: 'Method',
            capabilityId: 'Aspire.Hosting/waitForResourceCompletion',
            qualifiedName: 'waitForCompletion',
          },
        ]),
      ]
    );

    expect(
      index.resolve('Aspire.Hosting.ResourceBuilderExtensions.WaitForCompletion').typescript
    ).toEqual({
      label: 'waitForCompletion',
      path: '/reference/api/typescript/aspire.hosting/waitforcompletion/',
    });
  });

  it('does not invent a TypeScript API when the C# member is not exported', () => {
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting', [
          {
            name: 'IResourceBuilder',
            fullName: 'Aspire.Hosting.ApplicationModel.IResourceBuilder<T>',
            genericParameters: [{ name: 'T' }],
            members: [{ name: 'WithAnnotation', kind: 'method' }],
          },
        ]),
      ],
      []
    );

    const resolution = index.resolve(
      'Aspire.Hosting.ApplicationModel.IResourceBuilder.WithAnnotation'
    );

    expect(resolution.csharp).toEqual({
      label: 'WithAnnotation',
      path: '/reference/api/csharp/aspire.hosting/iresourcebuilder-1/methods/#withannotation',
    });
    expect(resolution.typescript).toEqual({ label: 'WithAnnotation' });
    expect(resolution.diagnostics).toMatchObject([
      { code: 'missing-typescript', severity: 'warning' },
    ]);
  });

  it('does not match an ignored member to another type by name alone', () => {
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting', [
          {
            name: 'ExecuteCommandContext',
            fullName: 'Aspire.Hosting.ApplicationModel.ExecuteCommandContext',
            members: [
              {
                name: 'ServiceProvider',
                kind: 'property',
                attributes: [
                  {
                    name: EXPORT_IGNORE_ATTRIBUTE,
                    arguments: {
                      Reason: 'Obsolete alias for Services.',
                    },
                  },
                ],
              },
            ],
          },
        ]),
      ],
      [
        {
          package: { name: 'Aspire.Hosting' },
          handleTypes: [
            {
              name: 'DistributedApplicationExecutionContext',
              fullName: 'Aspire.Hosting.DistributedApplicationExecutionContext',
              capabilities: [
                {
                  name: 'serviceProvider',
                  kind: 'PropertyGetter',
                  targetTypeId:
                    'Aspire.Hosting/Aspire.Hosting.DistributedApplicationExecutionContext',
                },
              ],
            },
          ],
        },
      ]
    );

    const resolution = index.resolve(
      'Aspire.Hosting.ApplicationModel.ExecuteCommandContext.ServiceProvider'
    );

    expect(resolution.typescript).toEqual({ label: 'ServiceProvider' });
    expect(resolution.diagnostics).toMatchObject([
      { code: 'missing-typescript', severity: 'warning' },
    ]);
  });

  it('matches extension exports to their receiver type', () => {
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting.Yarp', [
          {
            name: 'YarpResourceExtensions',
            fullName: 'Aspire.Hosting.YarpResourceExtensions',
            members: [
              {
                name: 'WithStaticFiles',
                kind: 'method',
                isStatic: true,
                isExtension: true,
                parameters: [
                  {
                    name: 'builder',
                    type: 'Aspire.Hosting.ApplicationModel.IResourceBuilder<Aspire.Hosting.Yarp.YarpResource>',
                    modifier: 'this',
                  },
                ],
                attributes: [
                  {
                    name: EXPORT_IGNORE_ATTRIBUTE,
                    arguments: {
                      Reason: 'An internal export provides the polyglot API.',
                    },
                  },
                ],
              },
            ],
          },
        ]),
      ],
      [
        tsDocument('Aspire.Hosting.Yarp', [
          {
            name: 'withStaticFiles',
            kind: 'Method',
            capabilityId: 'Aspire.Hosting.Yarp/withStaticFiles',
            qualifiedName: 'withStaticFiles',
            targetTypeId: 'Aspire.Hosting.Yarp/Aspire.Hosting.Yarp.YarpResource',
          },
        ]),
      ]
    );

    expect(
      index.resolve('Aspire.Hosting.YarpResourceExtensions.WithStaticFiles').typescript
    ).toEqual({
      label: 'withStaticFiles',
      path: '/reference/api/typescript/aspire.hosting.yarp/withstaticfiles/',
    });
  });

  it('reports ambiguity for extension families with different receiver routes', () => {
    const ignoredExport = {
      name: EXPORT_IGNORE_ATTRIBUTE,
      arguments: {
        Reason: 'An internal export provides the polyglot API.',
      },
    };
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting.Widget', [
          {
            name: 'WidgetExtensions',
            fullName: 'Aspire.Hosting.WidgetExtensions',
            members: [
              {
                name: 'WithFeature',
                kind: 'method',
                isStatic: true,
                isExtension: true,
                parameters: [
                  {
                    name: 'builder',
                    type: 'Aspire.Hosting.ApplicationModel.IResourceBuilder<Aspire.Hosting.FirstResource>',
                    modifier: 'this',
                  },
                ],
                attributes: [ignoredExport],
              },
              {
                name: 'WithFeature',
                kind: 'method',
                isStatic: true,
                isExtension: true,
                parameters: [
                  {
                    name: 'builder',
                    type: 'Aspire.Hosting.ApplicationModel.IResourceBuilder<Aspire.Hosting.SecondResource>',
                    modifier: 'this',
                  },
                ],
                attributes: [ignoredExport],
              },
            ],
          },
        ]),
      ],
      [
        tsDocument('Aspire.Hosting.Widget', [
          {
            name: 'withFeature',
            kind: 'Method',
            targetTypeId: 'Aspire.Hosting.Widget/Aspire.Hosting.FirstResource',
          },
          {
            name: 'withFeature',
            kind: 'Method',
            targetTypeId: 'Aspire.Hosting.Widget/Aspire.Hosting.SecondResource',
          },
        ]),
      ]
    );

    expect(index.resolve('Aspire.Hosting.WidgetExtensions.WithFeature').diagnostics).toMatchObject([
      {
        code: 'ambiguous-typescript',
        severity: 'error',
      },
    ]);
  });

  it('resolves canonical dispatcher exports across TypeScript modules', () => {
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting.Azure', [
          {
            name: 'AzureBicepResourceExtensions',
            fullName: 'Aspire.Hosting.AzureBicepResourceExtensions',
            members: [
              {
                name: 'WithEnvironment',
                kind: 'method',
                isStatic: true,
                isExtension: true,
                genericParameters: [
                  {
                    name: 'T',
                    constraints: ['Aspire.Hosting.ApplicationModel.IResourceWithEnvironment'],
                  },
                ],
                parameters: [
                  {
                    name: 'builder',
                    type: 'Aspire.Hosting.ApplicationModel.IResourceBuilder<T>',
                    modifier: 'this',
                  },
                ],
                attributes: [
                  {
                    name: EXPORT_IGNORE_ATTRIBUTE,
                    arguments: {
                      Reason:
                        'Polyglot AppHosts use the internal withEnvironment dispatcher export.',
                    },
                  },
                ],
              },
            ],
          },
        ]),
      ],
      [
        tsDocument('Aspire.Hosting', [
          {
            name: 'withEnvironment',
            kind: 'Method',
            capabilityId: 'Aspire.Hosting/withEnvironment',
            qualifiedName: 'withEnvironment',
            targetTypeId: 'Aspire.Hosting/Aspire.Hosting.ApplicationModel.IResourceWithEnvironment',
          },
        ]),
      ]
    );

    expect(
      index.resolve('Aspire.Hosting.AzureBicepResourceExtensions.WithEnvironment').typescript
    ).toEqual({
      label: 'withEnvironment',
      path: '/reference/api/typescript/aspire.hosting/withenvironment/',
    });
  });

  it('resolves type-level property exports and ignored dispatcher overloads', () => {
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting', [
          {
            name: 'DistributedApplicationExecutionContext',
            fullName: 'Aspire.Hosting.DistributedApplicationExecutionContext',
            attributes: [
              {
                name: EXPORT_ATTRIBUTE,
                arguments: { ExposeProperties: 'True' },
              },
            ],
            members: [{ name: 'IsPublishMode', kind: 'property' }],
          },
          {
            name: 'ResourceBuilderExtensions',
            fullName: 'Aspire.Hosting.ResourceBuilderExtensions',
            members: [
              {
                name: 'WithReference',
                kind: 'method',
                isStatic: true,
                isExtension: true,
                attributes: [
                  {
                    name: EXPORT_IGNORE_ATTRIBUTE,
                    arguments: {
                      Reason: 'Polyglot AppHosts use the internal withReference dispatcher export.',
                    },
                  },
                ],
              },
              {
                name: 'WithReference',
                kind: 'method',
                isStatic: true,
                isExtension: true,
                attributes: [
                  {
                    name: EXPORT_ATTRIBUTE,
                    constructorArguments: ['withReferenceCallback'],
                  },
                ],
              },
            ],
          },
        ]),
      ],
      [
        {
          package: { name: 'Aspire.Hosting' },
          functions: [
            {
              name: 'withReference',
              kind: 'Method',
              capabilityId: 'Aspire.Hosting/withReference',
              qualifiedName: 'withReference',
              targetTypeId:
                'Aspire.Hosting/Aspire.Hosting.ApplicationModel.IResourceWithEnvironment',
            },
            {
              name: 'withReferenceCallback',
              kind: 'Method',
              capabilityId: 'Aspire.Hosting/withReferenceCallback',
              qualifiedName: 'withReferenceCallback',
              targetTypeId:
                'Aspire.Hosting/Aspire.Hosting.ApplicationModel.IResourceWithEnvironment',
            },
          ],
          handleTypes: [
            {
              name: 'DistributedApplicationExecutionContext',
              fullName: 'Aspire.Hosting.DistributedApplicationExecutionContext',
              capabilities: [
                {
                  name: 'isPublishMode',
                  kind: 'PropertyGetter',
                  capabilityId:
                    'Aspire.Hosting/DistributedApplicationExecutionContext.isPublishMode',
                  qualifiedName: 'DistributedApplicationExecutionContext.isPublishMode',
                  targetTypeId:
                    'Aspire.Hosting/Aspire.Hosting.DistributedApplicationExecutionContext',
                },
              ],
            },
          ],
        },
      ]
    );

    expect(
      index.resolve('Aspire.Hosting.DistributedApplicationExecutionContext.IsPublishMode')
        .typescript
    ).toEqual({
      label: 'isPublishMode',
      path: '/reference/api/typescript/aspire.hosting/distributedapplicationexecutioncontext/#ispublishmode',
    });
    expect(
      index.resolve('Aspire.Hosting.ResourceBuilderExtensions.WithReference').typescript
    ).toEqual({
      label: 'withReference',
      path: '/reference/api/typescript/aspire.hosting/withreference/',
    });
  });

  it('requires a package qualifier for ambiguous C# identities', () => {
    const duplicateType = {
      name: 'SharedExtensions',
      fullName: 'Aspire.Hosting.SharedExtensions',
      members: [{ name: 'WithShared', kind: 'method' }],
    };
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting.One', [duplicateType]),
        packageDocument('Aspire.Hosting.Two', [duplicateType]),
      ],
      []
    );

    const resolution = index.resolve('Aspire.Hosting.SharedExtensions.WithShared');

    expect(resolution.status).toBe('ambiguous');
    expect(resolution.diagnostics[0]).toMatchObject({
      code: 'ambiguous-csharp',
      severity: 'error',
    });
    expect(resolution.diagnostics[0].candidates).toHaveLength(2);
    expect(
      index.resolve('Aspire.Hosting.SharedExtensions.WithShared', 'Aspire.Hosting.One')
    ).toMatchObject({
      status: 'resolved',
      csharp: {
        path: '/reference/api/csharp/aspire.hosting.one/sharedextensions/methods/#withshared',
      },
    });
  });

  it('preserves ambiguity between generic arities within one package', () => {
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting', [
          {
            name: 'IResourceWithParent',
            fullName: 'Aspire.Hosting.ApplicationModel.IResourceWithParent',
            members: [{ name: 'Parent', kind: 'property' }],
          },
          {
            name: 'IResourceWithParent',
            fullName: 'Aspire.Hosting.ApplicationModel.IResourceWithParent<T>',
            genericParameters: [{ name: 'T' }],
            members: [{ name: 'Parent', kind: 'property' }],
          },
        ]),
      ],
      []
    );

    const resolution = index.resolve(
      'Aspire.Hosting.ApplicationModel.IResourceWithParent.Parent',
      'Aspire.Hosting'
    );

    expect(resolution.status).toBe('ambiguous');
    expect(resolution.diagnostics).toMatchObject([
      {
        code: 'ambiguous-csharp',
        severity: 'error',
      },
    ]);
    expect(resolution.diagnostics[0].candidates).toHaveLength(2);
  });

  it('reports ambiguous TypeScript routes instead of selecting the first overload', () => {
    const index = buildApiReferenceIndex(
      [widgetPackage],
      [
        tsDocument('Aspire.Hosting.Widget', [
          {
            name: 'addWidget',
            kind: 'Method',
            capabilityId: 'Aspire.Hosting.Widget/addWidget',
            qualifiedName: 'addWidget',
            targetTypeId: 'Aspire.Hosting.Widget/FirstBuilder',
          },
          {
            name: 'addWidget',
            kind: 'Method',
            capabilityId: 'Aspire.Hosting.Widget/addWidget',
            qualifiedName: 'addWidget',
            targetTypeId: 'Aspire.Hosting.Widget/SecondBuilder',
          },
        ]),
      ]
    );

    expect(
      index.resolve('Aspire.Hosting.WidgetBuilderExtensions.AddWidget').diagnostics
    ).toMatchObject([{ code: 'ambiguous-typescript', severity: 'error' }]);
  });

  it('suggests generated candidates for an unresolved FQN', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const resolution = index.resolve('Aspire.Hosting.OtherExtensions.AddWidget');

    expect(resolution.status).toBe('missing');
    expect(resolution.diagnostics[0]).toMatchObject({
      code: 'missing-csharp',
      candidates: ['Aspire.Hosting.WidgetBuilderExtensions.AddWidget'],
    });
  });

  it('reports ambiguity when a member exports multiple TypeScript method names', () => {
    // A member with two [AspireExport] attributes declaring different MethodNames
    // must not silently pick one for a method-group reference: the canonical
    // name from the primary member (`addWidget`) is absent from both exports,
    // so both TS candidates remain and the resolver flags ambiguity.
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting.Widget', [
          {
            name: 'WidgetBuilderExtensions',
            fullName: 'Aspire.Hosting.WidgetBuilderExtensions',
            members: [
              {
                name: 'AddWidget',
                kind: 'method',
                isStatic: true,
                isExtension: true,
                attributes: [
                  {
                    name: EXPORT_ATTRIBUTE,
                    constructorArguments: ['primary'],
                    arguments: { MethodName: 'addWidget0' },
                  },
                  {
                    name: EXPORT_ATTRIBUTE,
                    constructorArguments: ['secondary'],
                    arguments: { MethodName: 'addWidget1' },
                  },
                ],
              },
            ],
          },
        ]),
      ],
      [
        tsDocument('Aspire.Hosting.Widget', [
          {
            name: 'addWidget0',
            kind: 'Method',
            capabilityId: 'Aspire.Hosting.Widget/primary',
            qualifiedName: 'addWidget0',
          },
          {
            name: 'addWidget1',
            kind: 'Method',
            capabilityId: 'Aspire.Hosting.Widget/secondary',
            qualifiedName: 'addWidget1',
          },
        ])
      ]
    );

    expect(
      index.resolve('Aspire.Hosting.WidgetBuilderExtensions.AddWidget').diagnostics
    ).toMatchObject([{ code: 'ambiguous-typescript', severity: 'error' }]);
  });

  it('populates the language-neutral targets record for every registered provider', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const resolution = index.resolve('Aspire.Hosting.WidgetBuilderExtensions.AddWidget');

    expect(resolution.primaryLanguage).toBe('csharp');
    expect(resolution.targets).toBeDefined();
    // The registry MUST populate targets — the astro renderer iterates that
    // map and only falls back to the legacy csharp/typescript aliases when
    // targets is missing, which would silently hide regressions.
    expect(resolution.targets?.csharp).toBe(resolution.csharp);
    expect(resolution.targets?.typescript).toBe(resolution.typescript);
    expect(Object.keys(resolution.targets ?? {}).sort()).toEqual(['csharp', 'typescript']);
  });

  it('routes target-owned diagnostics through the registered target providers', () => {
    // The missing-typescript diagnostic is emitted by the TypeScript target
    // provider, not the primary C# provider. Verifying it flows through the
    // registry ensures newly registered target providers can attach their
    // own diagnostics in the same way.
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting', [
          {
            name: 'ResourceBuilderExtensions',
            fullName: 'Aspire.Hosting.ResourceBuilderExtensions',
            members: [{ name: 'WithAnnotation', kind: 'method' }],
          },
        ]),
      ],
      [tsDocument('Aspire.Hosting', [])]
    );
    const resolution = index.resolve(
      'Aspire.Hosting.ResourceBuilderExtensions.WithAnnotation'
    );

    expect(resolution.status).toBe('resolved');
    expect(resolution.targets?.typescript).toEqual({ label: 'WithAnnotation' });
    expect(resolution.diagnostics).toMatchObject([
      { code: 'missing-typescript', severity: 'warning' },
    ]);
  });
});

describe('API reference provider registry', () => {
  it('drives an additional target-language provider without core changes', async () => {
    // Simulates a future AppHost language: register a third provider with a
    // non-legacy id and verify the registry: (a) builds its index, (b)
    // supplies it with the ExportMapping cross-language contract, (c)
    // surfaces its target under resolution.targets keyed by its id, and
    // (d) forwards its diagnostics unchanged.
    const { ApiReferenceProviderRegistry } = await import(
      '@utils/api-reference/registry'
    );
    const { CSharpLanguageProvider } = await import(
      '@utils/api-reference/csharp-provider'
    );

    interface PythonModuleDocument {
      moduleName: string;
      exports: { capabilityId?: string; methodName: string; snakeCase: string }[];
    }

    interface PythonIndex {
      byCapabilityId: Map<string, PythonModuleDocument['exports'][number] & { module: string }>;
      byMethodName: Map<string, PythonModuleDocument['exports'][number] & { module: string }>;
    }

    const pythonModule: PythonModuleDocument = {
      moduleName: 'aspire.hosting.widget',
      exports: [
        {
          capabilityId: 'Aspire.Hosting.Widget/addWidget',
          methodName: 'addWidget',
          snakeCase: 'add_widget',
        },
      ],
    };

    let buildIndexCalls = 0;
    let resolveTargetCalls = 0;
    const pythonProvider: TargetLanguageProvider<PythonModuleDocument, PythonIndex> = {
      id: 'python',
      role: 'target' as const,
      buildIndex(documents: readonly PythonModuleDocument[]): PythonIndex {
        buildIndexCalls++;
        const byCapabilityId = new Map<
          string,
          PythonModuleDocument['exports'][number] & { module: string }
        >();
        const byMethodName = new Map<
          string,
          PythonModuleDocument['exports'][number] & { module: string }
        >();
        for (const document of documents) {
          for (const entry of document.exports) {
            const enriched = { ...entry, module: document.moduleName };
            if (entry.capabilityId) byCapabilityId.set(entry.capabilityId, enriched);
            byMethodName.set(entry.methodName.toLowerCase(), enriched);
          }
        }
        return { byCapabilityId, byMethodName };
      },
      resolveTarget(context, primaryTarget, index: PythonIndex) {
        resolveTargetCalls++;
        for (const mapping of context.mappings) {
          const match =
            (mapping.capabilityId && index.byCapabilityId.get(mapping.capabilityId)) ||
            index.byMethodName.get(mapping.methodName.toLowerCase());
          if (match) {
            return {
              target: {
                label: match.snakeCase,
                path: `/reference/api/python/${match.module}/${match.snakeCase}/`,
              },
              diagnostics: [],
            };
          }
        }
        return {
          target: { label: primaryTarget.label },
          diagnostics: [
            {
              code: 'missing-typescript',
              severity: 'warning',
              message: `ApiReference: "${context.fqn}" has no Python export.`,
              candidates: [],
            } as const,
          ],
        };
      },
    };

    const registry = new ApiReferenceProviderRegistry(new CSharpLanguageProvider(), [
      pythonProvider,
    ]);
    const index = registry.build({
      csharp: [widgetPackage],
      python: [pythonModule],
    });
    const resolution = index.resolve('Aspire.Hosting.WidgetBuilderExtensions.AddWidget');

    expect(buildIndexCalls).toBe(1);
    expect(resolveTargetCalls).toBeGreaterThan(0);
    expect(resolution.status).toBe('resolved');
    expect(resolution.primaryLanguage).toBe('csharp');
    expect(resolution.targets).toBeDefined();
    expect(Object.keys(resolution.targets ?? {}).sort()).toEqual(['csharp', 'python']);
    expect(resolution.targets?.python).toEqual({
      label: 'add_widget',
      path: '/reference/api/python/aspire.hosting.widget/add_widget/',
    });
    expect(resolution.diagnostics).toEqual([]);
  });

  it('emits a target-owned missing diagnostic when the registered provider cannot resolve', async () => {
    const { ApiReferenceProviderRegistry } = await import(
      '@utils/api-reference/registry'
    );
    const { CSharpLanguageProvider } = await import(
      '@utils/api-reference/csharp-provider'
    );

    const pythonProvider = {
      id: 'python',
      role: 'target' as const,
      buildIndex() {
        return {};
      },
      resolveTarget(context: { fqn: string }, primaryTarget: { label: string }) {
        return {
          target: { label: primaryTarget.label },
          diagnostics: [
            {
              code: 'missing-typescript',
              severity: 'warning',
              message: `ApiReference: "${context.fqn}" has no Python export.`,
              candidates: [],
            } as const,
          ],
        };
      },
    };

    const registry = new ApiReferenceProviderRegistry(new CSharpLanguageProvider(), [
      pythonProvider,
    ]);
    const index = registry.build({
      csharp: [widgetPackage],
      python: [],
    });
    const resolution = index.resolve('Aspire.Hosting.WidgetBuilderExtensions.AddWidget');

    expect(resolution.targets?.python).toEqual({ label: 'AddWidget' });
    expect(resolution.diagnostics).toMatchObject([
      {
        severity: 'warning',
        message: expect.stringContaining('Python export'),
      },
    ]);
  });
});

describe('API reference overloads', () => {
  const name = 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget';
  const receiver = {
    name: 'builder',
    type: 'Aspire.Hosting.IDistributedApplicationBuilder',
    modifier: 'this',
  };
  const members = ['One.Options', 'Two.Options'].map((type, index) => ({
    name: 'AddWidget',
    kind: 'method',
    isStatic: true,
    isExtension: true,
    parameters: [receiver, { name: 'options', type }],
    docs: {
      summary: [
        {
          kind: 'para',
          children: [
            { kind: 'text', text: ' Uses ' },
            { kind: 'code', text: `Options${index}` },
            { kind: 'text', text: '.' },
          ],
        },
      ],
    },
    attributes: [
      {
        name: EXPORT_ATTRIBUTE,
        constructorArguments: [`addWidget${index}`],
        arguments: { MethodName: `addWidget${index}` },
      },
    ],
  }));
  const pkg = packageDocument('Aspire.Hosting.Widget', [
    {
      name: 'WidgetBuilderExtensions',
      fullName: 'Aspire.Hosting.WidgetBuilderExtensions',
      members,
    },
  ]);
  const module = tsDocument(
    'Aspire.Hosting.Widget',
    members.map((_, index) => ({
      name: `addWidget${index}`,
      kind: 'Method',
      capabilityId: `Aspire.Hosting.Widget/addWidget${index}`,
      description: `Uses \`Options${index}\` in TypeScript.`,
      parameters: [{ name: 'options', type: `Options${index}`, isOptional: true }],
    }))
  );

  it('selects exact anchors despite short-type collisions and uses the selected TS export', () => {
    const index = buildApiReferenceIndex([pkg], [module]);
    const anchors = resolveMemberAnchors(members);
    for (const [ordinal, member] of members.entries()) {
      const types = member.parameters.map((parameter) => parameter.type);
      const resolution = index.resolve(name, undefined, types);
      expect(resolution).toBe(index.resolve(name, undefined, [...types]));
      expect(resolution).toMatchObject({
        status: 'resolved',
        csharp: {
          label: 'AddWidget(Options options)',
          description: `Uses Options${ordinal}.`,
          path: `/reference/api/csharp/aspire.hosting.widget/widgetbuilderextensions/methods/#${anchors[ordinal].exact}`,
        },
        typescript: {
          label: `addWidget${ordinal}(options?: Options${ordinal})`,
          description: `Uses Options${ordinal} in TypeScript.`,
          path: `/reference/api/typescript/aspire.hosting.widget/addwidget${ordinal}/`,
        },
        diagnostics: [],
      });
    }
    expect(anchors[0].exact).not.toBe(anchors[1].exact);
    expect(index.resolve(name).csharp.label).toBe('AddWidget');
  });

  it('reports incorrect types and missing receivers instead of linking the first overload', () => {
    const index = buildApiReferenceIndex([pkg], [module]);
    for (const types of [
      [],
      ['One.Options'],
      [receiver.type, 'Options'],
      ['One.Options', receiver.type],
    ]) {
      const resolution = index.resolve(name, undefined, types);
      expect(resolution.status).toBe('missing');
      expect(resolution.csharp.path).toBeUndefined();
      expect(resolution.diagnostics).toMatchObject([
        { code: 'missing-overload', severity: 'error' },
      ]);
    }
  });

  it('retains package ambiguity and accepts package qualification', () => {
    const duplicate = packageDocument('Aspire.Hosting.Other', pkg.types);
    const index = buildApiReferenceIndex([pkg, duplicate], [module]);
    const types = members[0].parameters.map((parameter) => parameter.type);
    expect(index.resolve(name, undefined, types).diagnostics[0].code).toBe('ambiguous-overload');
    expect(index.resolve(name, 'Aspire.Hosting.Widget', types).status).toBe('resolved');
  });

  it('reports same-type overload ambiguity rather than choosing by order', () => {
    const duplicate = packageDocument('Aspire.Hosting.Widget', [
      {
        ...pkg.types![0],
        members: [members[0], { ...members[0], genericParameters: [{ name: 'T' }] }],
      },
    ]);
    const index = buildApiReferenceIndex([duplicate], [module]);
    const resolution = index.resolve(
      name,
      undefined,
      members[0].parameters.map((p) => p.type)
    );
    expect(resolution.diagnostics[0].code).toBe('ambiguous-overload');
    expect(resolution.csharp.path).toBeUndefined();
  });

  it('distinguishes a selected zero-parameter overload from a method-group reference', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    expect(index.resolve(name).csharp.label).toBe('AddWidget');
    expect(index.resolve(name, undefined, []).csharp.label).toBe('AddWidget()');
    expect(index.resolve(name, undefined, []).typescript.label).toBe('addWidget()');
  });

  it('preserves nullable generic and array types in a selected signature', () => {
    const type =
      'System.Collections.Generic.List<System.Collections.Generic.List<System.String>?>?[]';
    const index = buildApiReferenceIndex(
      [
        packageDocument('Aspire.Hosting.Widget', [
          {
            ...pkg.types![0],
            members: [{ ...members[0], parameters: [receiver, { name: 'values', type }] }],
          },
        ]),
      ],
      [module]
    );
    expect(index.resolve(name, undefined, [receiver.type, type]).csharp.label).toBe(
      'AddWidget(List<List<String>?>?[] values)'
    );
  });

  it('validates static arrays in MDX and nested JSX, including spread precedence', () => {
    const index = buildApiReferenceIndex([pkg], [module]);
    const props = `name="${name}" package="Aspire.Hosting.Widget" parameterTypes={${JSON.stringify(members[0].parameters.map((p) => p.type))}}`;
    const diagnostics = validateApiReferenceSource(
      {
        path: 'test.mdx',
        content: [
          `<ApiReference {...props} ${props} />`,
          `{true && <ApiReference ${props} />}`,
          `<Wrapper child={<ApiReference ${props} />} />`,
          `<ApiReference ${props} {...props} name="${name}" package="Aspire.Hosting.Widget" />`,
          `<ApiReference name="${name}" parameterTypes={['wrong']} />`,
        ].join('\n'),
      },
      index
    );
    expect(diagnostics).toMatchObject([
      { line: 4, code: 'unsupported-spread', message: expect.stringContaining('parameterTypes') },
      { line: 5, code: 'missing-overload' },
    ]);
  });

  it.each(['types', '[type]', '[...types]', '[""]', '"string"', '[42]', '[["string"]]'])(
    'rejects non-static or malformed parameterTypes: %s',
    (expression) => {
      const index = buildApiReferenceIndex([pkg], [module]);
      expect(
        validateApiReferenceSource(
          {
            path: 'test.mdx',
            content: `<ApiReference name="${name}" parameterTypes={${expression}} />`,
          },
          index
        )
      ).toMatchObject([{ code: 'invalid-overload', severity: 'error' }]);
    }
  );
});

describe('API reference authoring validator', () => {
  it('reports the source file, line, FQN, and candidates', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const diagnostics = validateApiReferenceSource(
      {
        path: 'src/content/docs/test.mdx',
        content:
          '---\ntitle: Test\n---\n\n<ApiReference name="Aspire.Hosting.OtherExtensions.AddWidget" />\n',
      },
      index
    );

    expect(diagnostics).toMatchObject([
      {
        filePath: 'src/content/docs/test.mdx',
        line: 5,
        name: 'Aspire.Hosting.OtherExtensions.AddWidget',
        code: 'missing-csharp',
        candidates: ['Aspire.Hosting.WidgetBuilderExtensions.AddWidget'],
      },
    ]);
  });

  it('rejects dynamic or missing name props', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const diagnostics = validateApiReferenceSource(
      {
        path: 'src/content/docs/test.mdx',
        content: '<ApiReference name={apiName} />',
      },
      index
    );

    expect(diagnostics).toMatchObject([{ code: 'invalid-fqn', severity: 'error', line: 1 }]);
  });

  it('rejects dynamic package qualifiers', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const diagnostics = validateApiReferenceSource(
      {
        path: 'src/content/docs/test.mdx',
        content:
          '<ApiReference name="Aspire.Hosting.WidgetBuilderExtensions.AddWidget" package={packageName} />',
      },
      index
    );

    expect(diagnostics).toMatchObject([{ code: 'invalid-fqn', severity: 'error', line: 1 }]);
  });

  it('validates paired components and ignores misleading attribute contents', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const diagnostics = validateApiReferenceSource(
      {
        path: 'src/content/docs/test.mdx',
        content: [
          '<ApiReference name="Aspire.Hosting.OtherExtensions.AddWidget"></ApiReference>',
          '<ApiReference title={`name="Aspire.Hosting.WidgetBuilderExtensions.AddWidget"`} name={apiName} />',
          '```mdx',
          '<ApiReference name="Ignored.In.Code" />',
          '```',
        ].join('\n'),
      },
      index
    );

    expect(diagnostics).toMatchObject([
      {
        line: 1,
        name: 'Aspire.Hosting.OtherExtensions.AddWidget',
        code: 'missing-csharp',
      },
      {
        line: 2,
        code: 'invalid-fqn',
      },
    ]);
  });

  it('validates static expression props and components inside MDX expressions', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const diagnostics = validateApiReferenceSource(
      {
        path: 'src/content/docs/test.mdx',
        content: [
          '<ApiReference {...props} name={"Aspire.Hosting.WidgetBuilderExtensions.AddWidget"} package={"Aspire.Hosting.Widget"} parameterTypes={[]} />',
          '{true && <ApiReference name="Aspire.Hosting.OtherExtensions.AddWidget" />}',
          '<ApiReference name={"Aspire.Hosting.WidgetBuilderExtensions.AddWidget"} {...props} />',
        ].join('\n'),
      },
      index
    );

    expect(diagnostics).toMatchObject([
      {
        line: 2,
        name: 'Aspire.Hosting.OtherExtensions.AddWidget',
        code: 'missing-csharp',
      },
      {
        line: 3,
        code: 'unsupported-spread',
      },
    ]);
  });

  it.each([
    '<ApiReference name="Aspire.Hosting.WidgetBuilderExtensions.AddWidget" {...props} />',
    '<ApiReference {...props} name="Aspire.Hosting.WidgetBuilderExtensions.AddWidget" />',
    '{true && <ApiReference name="Aspire.Hosting.WidgetBuilderExtensions.AddWidget" {...props} />}',
    '<Wrapper child={<ApiReference {...props} name="Aspire.Hosting.WidgetBuilderExtensions.AddWidget" />} />',
    '<ApiReference name="Aspire.Hosting.WidgetBuilderExtensions.AddWidget" {...{}} />',
  ])('reports uncertain spread props explicitly: %s', (content) => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const diagnostics = validateApiReferenceSource(
      { path: 'spread.mdx', content: `\n${content}` },
      index
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        filePath: 'spread.mdx',
        line: 2,
        code: 'unsupported-spread',
        severity: 'error',
        message: expect.stringContaining('spread props cannot be statically validated'),
      }),
    ]);
    expect(diagnostics[0].message).toContain('package, parameterTypes');
  });

  it('does not require optional props when no spread is present', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    expect(validateApiReferenceSource({
      path: 'test.mdx',
      content: '<ApiReference name="Aspire.Hosting.WidgetBuilderExtensions.AddWidget" />',
    }, index)).toEqual([]);
  });

  it('validates components inside MDX attributes and exports', () => {
    const index = buildApiReferenceIndex([widgetPackage], [widgetModule]);
    const diagnostics = validateApiReferenceSource(
      {
        path: 'src/content/docs/test.mdx',
        content: [
          '<Wrapper child={<ApiReference name="Aspire.Hosting.OtherExtensions.AddWidget" />} />',
          'export const reference = <ApiReference name="Aspire.Hosting.OtherExtensions.AddWidget" />',
        ].join('\n'),
      },
      index
    );

    expect(diagnostics).toMatchObject([
      {
        line: 1,
        name: 'Aspire.Hosting.OtherExtensions.AddWidget',
        code: 'missing-csharp',
      },
      {
        line: 2,
        name: 'Aspire.Hosting.OtherExtensions.AddWidget',
        code: 'missing-csharp',
      },
    ]);
  });

  it('resolves every authored API reference against the generated catalogs', () => {
    const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));
    const readJsonDocuments = <T>(directory: string): T[] =>
      fs
        .readdirSync(directory)
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
          const parsed: unknown = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
          return parsed as T;
        });
    const readMdxFiles = (directory: string): string[] => {
      const files: string[] = [];
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          files.push(...readMdxFiles(entryPath));
        } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
          files.push(entryPath);
        }
      }
      return files;
    };

    const packageDocuments = readJsonDocuments<ApiReferencePackageDocument>(
      path.join(frontendRoot, 'src', 'data', 'pkgs')
    );
    const index = buildApiReferenceIndex(
      packageDocuments,
      readJsonDocuments<ApiReferenceTsDocument>(
        path.join(frontendRoot, 'src', 'data', 'ts-modules')
      )
    );
    const files = readMdxFiles(path.join(frontendRoot, 'src', 'content', 'docs')).map(
      (filePath) => ({
        path: path.relative(frontendRoot, filePath).replaceAll('\\', '/'),
        content: fs.readFileSync(filePath, 'utf8'),
      })
    );

    const overload = index.resolve(
      'Aspire.Hosting.ResourceBuilderExtensions.WithEnvironment',
      undefined,
      ['Aspire.Hosting.ApplicationModel.IResourceBuilder<T>', 'string', 'string?']
    );
    expect(overload).toMatchObject({
      csharp: {
        label: 'WithEnvironment(string name, string? value)',
        path: '/reference/api/csharp/aspire.hosting/resourcebuilderextensions/methods/#withenvironment-iresourcebuilder-t-string-string',
      },
      typescript: {
        label:
          'withEnvironment(name: string, value: string | ReferenceExpression | EndpointReference | ParameterResource | ExternalServiceResource | IResourceWithConnectionString | IExpressionValue)',
        path: '/reference/api/typescript/aspire.hosting/withenvironment/',
      },
      diagnostics: [],
    });

    expect(
      index.resolve('Aspire.Hosting.YarpResourceExtensions.WithStaticFiles').typescript.path
    ).toBe('/reference/api/typescript/aspire.hosting.yarp/withstaticfiles/');
    expect(
      index.resolve('Aspire.Hosting.AzureBicepResourceExtensions.WithEnvironment').typescript.path
    ).toBe('/reference/api/typescript/aspire.hosting/withenvironment/');
    expect(
      index.resolve('Aspire.Hosting.QdrantBuilderExtensions.WithReference', 'Aspire.Hosting.Qdrant')
        .typescript.path
    ).toBe('/reference/api/typescript/aspire.hosting/withreference/');
    expect(
      index.resolve('Aspire.Hosting.ExternalServiceBuilderExtensions.WithHttpHealthCheck')
        .typescript.path
    ).toContain('externalserviceresource');
    expect(
      index.resolve('Aspire.Hosting.ApplicationModel.ExecuteCommandContext.ServiceProvider')
        .diagnostics
    ).toMatchObject([{ code: 'missing-typescript', severity: 'warning' }]);
    expect(
      index.resolve('Aspire.Hosting.DistributedApplicationExecutionContext.IsPublishMode')
        .typescript.path
    ).toBe(
      '/reference/api/typescript/aspire.hosting/distributedapplicationexecutioncontext/#ispublishmode'
    );

    const declaredExportFailures: string[] = [];
    const checkedExports = new Set<string>();
    for (const pkg of packageDocuments) {
      for (const type of pkg.types ?? []) {
        const typeName = (
          type.fullName ?? `${type.namespace ? `${type.namespace}.` : ''}${type.name}`
        )
          .replace(/`\d+/g, '')
          .replace(/<.*>$/, '');

        for (const member of type.members ?? []) {
          const hasMemberExport = (member.attributes ?? []).some((attribute) =>
            /(?:^|\.)AspireExportAttribute$/.test(attribute.name)
          );
          if (!hasMemberExport) continue;

          const fqn = `${typeName}.${member.name}`;
          const key = `${pkg.package.name}\0${fqn}`;
          if (checkedExports.has(key)) continue;
          checkedExports.add(key);

          const resolution = index.resolve(fqn, pkg.package.name);
          const errors = resolution.diagnostics.filter(
            (diagnostic) => diagnostic.code === 'unresolved-typescript-export'
          );
          if (errors.length > 0) {
            declaredExportFailures.push(
              `${pkg.package.name}: ${fqn}\n${errors
                .map((diagnostic) => `  ${diagnostic.message}`)
                .join('\n')}`
            );
          }
        }
      }
    }

    expect(declaredExportFailures).toEqual([]);

    const diagnostics = validateApiReferenceFiles(files, index);

    expect(diagnostics, formatApiReferenceDiagnostics(diagnostics)).toEqual([]);
  });
});

describe('ApiReference component', () => {
  beforeEach(() => {
    apiReferenceMocks.resolve.mockReset();
  });

  it('renders indexed links as valid inline phrasing content', async () => {
    apiReferenceMocks.resolve.mockResolvedValue({
      name: 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget',
      status: 'resolved',
      csharp: {
        label: 'AddWidget',
        path: '/reference/api/csharp/aspire.hosting.widget/widgetbuilderextensions/methods/#addwidget',
      },
      typescript: {
        label: 'addWidget',
        path: '/reference/api/typescript/aspire.hosting.widget/addwidget/',
      },
      diagnostics: [],
    } satisfies ApiReferenceResolution);

    const html = normalizeHtml(
      await renderComponent(ApiReference, {
        props: {
          name: 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget',
        },
      })
    );

    expect(html).toContain('data-lang="csharp"');
    expect(html).toContain('AddWidget');
    expect(html).toContain('data-lang="typescript"');
    expect(html).toContain('addWidget');
    expect(html).toContain('aria-label="AddWidget — C# API reference"');
    expect(html).toContain('aria-label="addWidget — TypeScript API reference"');
    expect(html).toContain('title="AddWidget — C# API reference"');
    expect(html.match(/data-tooltip-placement="top"/g)).toHaveLength(2);
    expect(html.match(/data-tippy-allowhtml="false"/g)).toHaveLength(2);
    expect(html).toContain('ar-icon i-material-icon-theme:csharp');
    expect(html).toContain('ar-icon i-material-icon-theme:typescript');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(html.match(/<code[^>]*>\s*<span class="ar-icon /g)).toHaveLength(2);
    expect(html).toContain(
      '/reference/api/csharp/aspire.hosting.widget/widgetbuilderextensions/methods/#addwidget'
    );
    expect(html).toContain('/reference/api/typescript/aspire.hosting.widget/addwidget/');
    expect(html).not.toMatch(/<pre|<figure|expressive-code|<script|data-aspire-lang/);
  });

  it.each([
    ['short', 'Adds a widget.', 'Adds a widget.'],
    ['exactly 160 characters', 'x'.repeat(160), 'x'.repeat(160)],
    ['word boundary', `${'word '.repeat(30)}remaining text`, `${'word '.repeat(30).trimEnd()}...`],
    ['unbroken token', 'x'.repeat(161), `${'x'.repeat(157)}...`],
    ['complete word at the limit', `${'x'.repeat(157)} tail`, `${'x'.repeat(157)}...`],
    ['whitespace boundary', `${'x'.repeat(150)} \t\nlongerword`, `${'x'.repeat(150)}...`],
  ])(
    'formats %s descriptions in both languages without changing links or labels',
    async (_, description, title) => {
      const resolution = {
        name: 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget',
        status: 'resolved',
        csharp: {
          label: 'AddWidget(string name)',
          description,
          path: '/reference/api/csharp/widget/#addwidget-string',
        },
        typescript: {
          label: 'addWidget(name: string)',
          description,
          path: '/reference/api/typescript/widget/addwidget/',
        },
        diagnostics: [],
      } satisfies ApiReferenceResolution;
      apiReferenceMocks.resolve.mockResolvedValue(resolution);

      const html = normalizeHtml(
        await renderComponent(ApiReference, { props: { name: resolution.name } })
      );

      expect([...html.matchAll(/\btitle="([^"]*)"/g)].map((match) => match[1])).toEqual([
        title,
        title,
      ]);
      expect(title.length).toBeLessThanOrEqual(160);
      expect(html).toContain('>AddWidget(string name)</span>');
      expect(html).toContain('>addWidget(name: string)</span>');
      expect(html).toContain('aria-label="AddWidget(string name) — C# API reference"');
      expect(html).toContain('aria-label="addWidget(name: string) — TypeScript API reference"');
      expect(html).toContain(`href="${resolution.csharp.path}"`);
      expect(html).toContain(`href="${resolution.typescript.path}"`);
      expect(html.match(/data-tooltip-placement="top"/g)).toHaveLength(2);
      expect(html.match(/data-tippy-allowhtml="false"/g)).toHaveLength(2);
      expect(resolution.csharp.description).toBe(description);
      expect(resolution.typescript.description).toBe(description);
    }
  );

  it('caps language-qualified fallback titles without shortening API labels', async () => {
    const label = 'x'.repeat(170);
    apiReferenceMocks.resolve.mockResolvedValue({
      name: 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget',
      status: 'resolved',
      csharp: { label, path: '/reference/api/csharp/widget/#addwidget' },
      typescript: { label, path: '/reference/api/typescript/widget/addwidget/' },
      diagnostics: [],
    } satisfies ApiReferenceResolution);

    const html = normalizeHtml(
      await renderComponent(ApiReference, {
        props: { name: 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget' },
      })
    );
    const title = `${'x'.repeat(157)}...`;
    expect([...html.matchAll(/\btitle="([^"]*)"/g)].map((match) => match[1])).toEqual([
      title,
      title,
    ]);
    expect(html).toContain(`>${label}</span>`);
    expect(html).toContain(`aria-label="${label} — C# API reference"`);
    expect(html).toContain(`aria-label="${label} — TypeScript API reference"`);
  });

  it('caps unresolved titles in both languages without changing source diagnostics', async () => {
    const message = 'Diagnostic '.repeat(20).trimEnd();
    const resolution = {
      name: 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget',
      status: 'missing',
      csharp: { label: 'AddWidget' },
      typescript: { label: 'AddWidget' },
      diagnostics: [{ code: 'missing-csharp', severity: 'error', message, candidates: [] }],
    } satisfies ApiReferenceResolution;
    apiReferenceMocks.resolve.mockResolvedValue(resolution);

    const html = normalizeHtml(
      await renderComponent(ApiReference, { props: { name: resolution.name } })
    );
    const title = `${'Diagnostic '.repeat(14).trimEnd()}...`;
    expect([...html.matchAll(/\btitle="([^"]*)"/g)].map((match) => match[1])).toEqual([
      title,
      title,
    ]);
    expect(title.length).toBeLessThanOrEqual(160);
    expect(resolution.diagnostics[0].message).toBe(message);
    expect(html).not.toContain('href=');
  });

  it('renders one-language APIs as warned, unlinked TypeScript code', async () => {
    const message =
      'ApiReference: "Aspire.Hosting.ApplicationModel.IResourceBuilder.WithAnnotation" has no TypeScript export; the C# API name is shown without a TypeScript link.';
    apiReferenceMocks.resolve.mockResolvedValue({
      name: 'Aspire.Hosting.ApplicationModel.IResourceBuilder.WithAnnotation',
      status: 'resolved',
      csharp: {
        label: 'WithAnnotation',
        path: '/reference/api/csharp/aspire.hosting/iresourcebuilder-1/methods/#withannotation',
      },
      typescript: { label: 'WithAnnotation' },
      diagnostics: [
        {
          code: 'missing-typescript',
          severity: 'warning',
          message,
          candidates: [],
        },
      ],
    } satisfies ApiReferenceResolution);

    const html = normalizeHtml(
      await renderComponent(ApiReference, {
        props: {
          name: 'Aspire.Hosting.ApplicationModel.IResourceBuilder.WithAnnotation',
        },
      })
    );

    expect(html).toContain(`title="${message.replaceAll('"', '&quot;')}"`);
    expect(html.match(/href=/g)).toHaveLength(1);
    expect(html.match(/class="ar-icon /g)).toHaveLength(1);
    expect(html).not.toContain('/reference/api/typescript/');
  });

  it('forwards overload parameters and renders the selected signature', async () => {
    apiReferenceMocks.resolve.mockResolvedValue({
      name: 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget',
      status: 'resolved',
      csharp: {
        label: 'AddWidget(string name)',
        description: 'Adds <T> safely.',
        path: '/reference/api/csharp/widget/#addwidget-string',
      },
      typescript: {
        label: 'addWidget(name: string)',
        description: 'Adds a named widget.',
        path: '/reference/api/typescript/widget/addwidget/',
      },
      diagnostics: [],
    } satisfies ApiReferenceResolution);
    const html = normalizeHtml(
      await renderComponent(ApiReference, {
        props: {
          name: 'Aspire.Hosting.WidgetBuilderExtensions.AddWidget',
          parameterTypes: ['string'],
        },
      })
    );
    expect(apiReferenceMocks.resolve.mock.calls[0][3]).toEqual(['string']);
    expect(html).toContain('AddWidget(string name)');
    expect(html).toContain('addWidget(name: string)');
    expect(html).toContain('#addwidget-string');
    expect(html).toContain('title="Adds <T> safely."');
    expect(html).toContain('title="Adds a named widget."');
  });
});
