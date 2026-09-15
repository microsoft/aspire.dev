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
import { normalizeHtml, renderComponent } from './astro-test-utils';

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
        label: 'AddWidget()',
        path: '/reference/api/csharp/aspire.hosting.widget/widgetbuilderextensions/methods/#addwidget',
      },
      typescript: {
        label: 'addWidget()',
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
      label: 'waitForCompletion()',
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
      label: 'WithAnnotation()',
      path: '/reference/api/csharp/aspire.hosting/iresourcebuilder-1/methods/#withannotation',
    });
    expect(resolution.typescript).toEqual({ label: 'WithAnnotation()' });
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
      label: 'withStaticFiles()',
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
      label: 'withEnvironment()',
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
      label: 'withReference()',
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
          '<ApiReference {...props} name={"Aspire.Hosting.WidgetBuilderExtensions.AddWidget"} package={"Aspire.Hosting.Widget"} />',
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
        code: 'invalid-fqn',
      },
    ]);
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
        label: 'AddWidget()',
        path: '/reference/api/csharp/aspire.hosting.widget/widgetbuilderextensions/methods/#addwidget',
      },
      typescript: {
        label: 'addWidget()',
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
    expect(html).toContain('AddWidget()');
    expect(html).toContain('data-lang="typescript"');
    expect(html).toContain('addWidget()');
    expect(html).toContain(
      '/reference/api/csharp/aspire.hosting.widget/widgetbuilderextensions/methods/#addwidget'
    );
    expect(html).toContain('/reference/api/typescript/aspire.hosting.widget/addwidget/');
    expect(html).not.toMatch(/<pre|<figure|expressive-code|<script|data-aspire-lang/);
  });

  it('renders one-language APIs as warned, unlinked TypeScript code', async () => {
    const message =
      'ApiReference: "Aspire.Hosting.ApplicationModel.IResourceBuilder.WithAnnotation" has no TypeScript export; the C# API name is shown without a TypeScript link.';
    apiReferenceMocks.resolve.mockResolvedValue({
      name: 'Aspire.Hosting.ApplicationModel.IResourceBuilder.WithAnnotation',
      status: 'resolved',
      csharp: {
        label: 'WithAnnotation()',
        path: '/reference/api/csharp/aspire.hosting/iresourcebuilder-1/methods/#withannotation',
      },
      typescript: { label: 'WithAnnotation()' },
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
    expect(html).not.toContain('/reference/api/typescript/');
  });
});
