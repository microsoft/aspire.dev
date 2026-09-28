import { expect, test } from 'vitest';
import { readEnumDeclarations, supplementAtsEnums } from '../../scripts/supplement-ats-enums';

function fixture() {
  const enumType = { TypeId: 'enum:Azure.Provisioning.Storage.Sku', Category: 'Enum' };
  return {
    dump: {
      Packages: [{ Name: 'Aspire.Hosting.Proxies', Version: '13.6.0' }],
      Capabilities: [
        {
          Parameters: [
            {
              Type: {
                TypeId: 'union[]',
                Category: 'Array',
                ElementType: {
                  TypeId: 'Handle|Sku',
                  Category: 'Union',
                  UnionTypes: [{ TypeId: 'Runtime/Example.Handle', Category: 'Handle' }, enumType],
                },
              },
            },
          ],
          ReturnType: enumType,
        },
      ],
      EnumTypes: [] as { TypeId: string; Name: string; Values: string[] }[],
    },
    reference: {
      package: { name: 'Aspire.Hosting.Proxies', version: '13.6.0' },
      declarations: [
        {
          owningAssembly: 'Azure.Provisioning.Storage',
          content: 'export enum Sku { Standard = "Standard", Premium = "Premium" }',
        },
      ],
    },
  };
}

test('fills missing union/array enum references from the matching canonical export', () => {
  const { dump, reference } = fixture();
  const result = supplementAtsEnums(dump, reference);
  expect(result.EnumTypes).toEqual([
    {
      TypeId: 'enum:Azure.Provisioning.Storage.Sku',
      Name: 'Sku',
      Values: ['Standard', 'Premium'],
    },
  ]);
  expect(dump.EnumTypes).toEqual([]);
  expect(supplementAtsEnums(result, reference)).toEqual(result);
});

test('rejects canonical metadata from a different package version', () => {
  const { dump, reference } = fixture();
  reference.package.version = '14.0.0';
  expect(() => supplementAtsEnums(dump, reference)).toThrow('package identity');
});

test('resolves a renamed enum through the canonical capability declaration', () => {
  const { dump, reference } = fixture();
  const withCapability = {
    ...dump,
    Capabilities: dump.Capabilities.map((capability) => ({
      ...capability,
      CapabilityId: 'Example/Resource.sku',
    })),
  };
  const withAlias = {
    ...reference,
    declarations: [
      {
        owningAssembly: 'Azure.Provisioning.Storage',
        content: 'export enum StorageSku { Standard = "Standard" }',
      },
    ],
    modules: [
      {
        items: [
          {
            capabilityId: 'Example/Resource.sku',
            declaration: 'sku: { get: () => Promise<StorageSku> }',
          },
        ],
      },
    ],
  };
  expect(supplementAtsEnums(withCapability, withAlias).EnumTypes).toEqual([
    {
      TypeId: 'enum:Azure.Provisioning.Storage.Sku',
      Name: 'StorageSku',
      Values: ['Standard'],
    },
  ]);
});

test('does not invent an enum when the canonical definition is missing', () => {
  const { dump, reference } = fixture();
  reference.declarations = [];
  expect(() => supplementAtsEnums(dump, reference)).toThrow('found 0');
});

test('rejects ambiguous canonical enum definitions', () => {
  const { dump, reference } = fixture();
  reference.declarations.push(reference.declarations[0]);
  expect(() => supplementAtsEnums(dump, reference)).toThrow('found 2');
});

test('does not silently rewrite enum wire values', () => {
  expect(() => readEnumDeclarations('export enum Sku { Standard = "different" }')).toThrow(
    'Unsupported value'
  );
});
