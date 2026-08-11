import { describe, expect, test } from 'vitest';

import {
  type ValidationInput,
  validateGeneratedApiData,
} from '../../scripts/validate-generated-api-data';

function createValidInput(): ValidationInput {
  const pkg = {
    package: {
      name: 'Aspire.Hosting.Foo',
      version: '1.0.0',
      sourceRepository: 'https://github.com/example/foo',
      sourceCommit: 'abc123',
    },
    types: [
      {
        name: 'FooResource',
        fullName: 'Aspire.Hosting.ApplicationModel.FooResource',
        kind: 'class',
        baseType: 'Aspire.Hosting.ApplicationModel.ExecutableResource',
        members: [
          {
            name: 'AddFoo',
            kind: 'method',
            signature: 'AddFoo(string name)',
            parameters: [{ name: 'name', type: 'System.String' }],
            attributes: [
              {
                name: 'Aspire.Hosting.AspireExportAttribute',
                constructorArguments: ['addFoo'],
              },
            ],
          },
        ],
      },
    ],
  };

  return {
    catalog: [{ title: 'Aspire.Hosting.Foo', version: '1.0.0' }],
    packages: [
      {
        fileName: 'Aspire.Hosting.Foo.1.0.0.json',
        data: structuredClone(pkg),
        baseline: structuredClone(pkg),
      },
    ],
    modules: [
      {
        fileName: 'Aspire.Hosting.Foo.1.0.0.json',
        data: {
          package: structuredClone(pkg.package),
          functions: [{}],
          dtoTypes: [
            {
              name: 'FooOptions',
              fields: [
                { name: 'Port', type: 'number', isOptional: true },
                { name: 'Host', type: 'string', isOptional: true },
              ],
            },
          ],
          handleTypes: [
            {
              name: 'ExecutableResource',
              fullName: 'Aspire.Hosting.ApplicationModel.ExecutableResource',
            },
            {
              name: 'FooResource',
              fullName: 'Aspire.Hosting.ApplicationModel.FooResource',
              implementedInterfaces: [
                'Aspire.Hosting.ApplicationModel.IResourceWithParent`1[[Aspire.Hosting.ApplicationModel.ExecutableResource]]',
              ],
              baseTypeHierarchy: [
                'Aspire.Hosting/Aspire.Hosting.ApplicationModel.ExecutableResource]]',
              ],
            },
          ],
        },
      },
    ],
    declarations: [
      'export interface FooOptions {',
      '  port?: number;',
      '  host?: string;',
      '}',
      'export interface ExecutableResource {',
      '}',
      'export interface FooResource extends ExecutableResource {',
      '}',
      'export interface FooResource {',
      '  augmentation?: string;',
      '}',
    ].join('\n'),
  };
}

describe('validateGeneratedApiData', () => {
  test('accepts semantically faithful generated data', () => {
    expect(validateGeneratedApiData(createValidInput()).errors).toEqual([]);
  });

  test('rejects TypeScript provenance that differs from the C# package', () => {
    const input = createValidInput();
    input.modules[0].data.package.sourceRepository = 'https://github.com/example/wrong';

    expect(validateGeneratedApiData(input).errors).toContain(
      'Source repository mismatch for Aspire.Hosting.Foo@1.0.0: C# has https://github.com/example/foo, TypeScript has https://github.com/example/wrong.'
    );
  });

  test('rejects lost DTO optionality', () => {
    const input = createValidInput();
    input.declarations = input.declarations.replace('port?: number', 'port: number');

    expect(validateGeneratedApiData(input).errors).toContain(
      'Twoslash DTO FooOptions.port optionality does not match ts-modules metadata.'
    );
  });

  test('rejects required DTO metadata', () => {
    const input = createValidInput();
    input.modules[0].data.dtoTypes![0].fields![1].isOptional = false;

    expect(validateGeneratedApiData(input).errors).toContain(
      'TypeScript DTO FooOptions.host is required, but the SDK emits every DTO field as optional.'
    );
  });

  test('rejects a missing DTO declaration', () => {
    const input = createValidInput();
    input.modules[0].data.dtoTypes![0].name = 'MissingOptions';

    expect(validateGeneratedApiData(input).errors).toContain(
      'Twoslash DTO MissingOptions is missing its declaration.'
    );
  });

  test('rejects inferred handle inheritance not present in metadata', () => {
    const input = createValidInput();
    input.declarations = input.declarations.replace(
      'FooResource extends ExecutableResource',
      'FooResource extends ExecutableResource, ContainerResource'
    );

    expect(validateGeneratedApiData(input).errors).toContain(
      'Twoslash handle FooResource has incorrect inheritance (missing: none; unexpected: ContainerResource).'
    );
  });

  test('rejects a missing handle declaration', () => {
    const input = createValidInput();
    input.modules[0].data.handleTypes![1].name = 'MissingResource';

    expect(validateGeneratedApiData(input).errors).toContain(
      'Twoslash handle MissingResource is missing its declaration.'
    );
  });

  test('rejects nested options DTO wrappers', () => {
    const input = createValidInput();
    input.declarations +=
      '\nexport interface BadOverload {\n  add(options?: { options?: FooOptions }): FooResource;\n}';

    expect(validateGeneratedApiData(input).errors).toContain(
      'Twoslash declarations contain a nested single-DTO options wrapper.'
    );
  });

  test('rejects same-version attribute payload loss', () => {
    const input = createValidInput();
    input.packages[0].data.types![0].members![0].attributes = [
      { name: 'Aspire.Hosting.AspireExportAttribute' },
    ];

    expect(validateGeneratedApiData(input).errors).toContain(
      'Attribute payload changed or disappeared for Aspire.Hosting.Foo@1.0.0 at type:Aspire.Hosting.ApplicationModel.FooResource/member:method:AddFoo(System.String)|Aspire.Hosting.AspireExportAttribute|0.'
    );
  });

  test('rejects same-version named attribute argument loss', () => {
    const input = createValidInput();
    const baselineAttributes = input.packages[0].baseline!.types![0].members![0].attributes!;
    const generatedAttributes = input.packages[0].data.types![0].members![0].attributes!;
    baselineAttributes.push({
      name: 'Aspire.Hosting.AspireExportIgnoreAttribute',
      arguments: { Reason: 'Not supported.' },
    });
    generatedAttributes.push({
      name: 'Aspire.Hosting.AspireExportIgnoreAttribute',
    });

    expect(validateGeneratedApiData(input).errors).toContain(
      'Attribute payload changed or disappeared for Aspire.Hosting.Foo@1.0.0 at type:Aspire.Hosting.ApplicationModel.FooResource/member:method:AddFoo(System.String)|Aspire.Hosting.AspireExportIgnoreAttribute|0.'
    );
  });

  test('rejects same-version marker attribute loss', () => {
    const input = createValidInput();
    input.packages[0].baseline!.types![0].members![0].attributes!.push({
      name: 'Aspire.Hosting.AspireDtoAttribute',
    });

    expect(validateGeneratedApiData(input).errors).toContain(
      'Attribute payload changed or disappeared for Aspire.Hosting.Foo@1.0.0 at type:Aspire.Hosting.ApplicationModel.FooResource/member:method:AddFoo(System.String)|Aspire.Hosting.AspireDtoAttribute|0.'
    );
  });

  test('allows same-version attribute payload values to change when their shape is retained', () => {
    const input = createValidInput();
    input.packages[0].data.types![0].members![0].attributes![0].constructorArguments = [
      'renamedAddFoo',
    ];

    expect(
      validateGeneratedApiData(input).errors.filter((error) =>
        error.startsWith('Attribute payload changed or disappeared')
      )
    ).toEqual([]);
  });

  test('rejects duplicate and stale generated identities', () => {
    const input = createValidInput();
    input.packages.push(structuredClone(input.packages[0]));
    input.catalog[0].version = '2.0.0';
    const errors = validateGeneratedApiData(input).errors;

    expect(errors).toContain('pkgs contains duplicate package identity Aspire.Hosting.Foo@1.0.0.');
    expect(errors).toContain(
      'Stale C# API output Aspire.Hosting.Foo@1.0.0; catalog version is 2.0.0.'
    );
    expect(errors).toContain('Missing C# API output for catalog package Aspire.Hosting.Foo@2.0.0.');
  });
});
