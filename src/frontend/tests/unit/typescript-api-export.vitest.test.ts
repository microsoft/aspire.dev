import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import {
  loadTypeScriptApiExport,
  parseTypeScriptApiExport,
  concatenateDeclarations,
  TypeScriptApiExportError,
  type TypeScriptApiExport,
  type TypeScriptApiItem,
  type TypeScriptApiMember,
} from '../../src/schemas/typescript-api-export';

const fixtureDir = fileURLToPath(new URL('../fixtures/typescript-api-export/', import.meta.url));

const corePath = join(fixtureDir, 'Aspire.Hosting.api.json');
const integrationPath = join(fixtureDir, 'Aspire.Hosting.Redis.api.json');

const core = loadTypeScriptApiExport(corePath);
const integration = loadTypeScriptApiExport(integrationPath);

/**
 * Produces a structurally valid export document that individual tests mutate to prove the
 * validator rejects a specific defect. Cloning the real core fixture would make every failure
 * message enormous, so this stays deliberately tiny.
 */
function validDocument(): TypeScriptApiExport {
  return {
    schemaVersion: 1,
    language: 'typescript',
    generator: {
      name: 'Aspire.Hosting.CodeGeneration.TypeScript',
      version: '13.5.0-dev',
    },
    package: { name: 'Aspire.Hosting.Redis', version: '13.5.0' },
    modules: [
      {
        name: 'Aspire.Hosting.Redis',
        items: [
          {
            id: 'interface:RedisResource',
            typeId: 'Aspire.Hosting.Redis/Aspire.Hosting.Redis.RedisResource',
            kind: 'interface',
            name: 'RedisResource',
            declaration: 'export interface RedisResource extends ResourceBuilderBase',
            owningAssembly: 'Aspire.Hosting.Redis',
          },
        ],
      },
    ],
    declarations: [
      {
        id: 'Aspire.Hosting.Redis:interface:RedisResource',
        content: 'export interface RedisResource extends ResourceBuilderBase {}',
        owningAssembly: 'Aspire.Hosting.Redis',
      },
    ],
  };
}

function validDocumentForPackage(packageName: string): TypeScriptApiExport {
  const document = validDocument();
  const typeName = packageName.replaceAll('.', '');
  document.package.name = packageName;
  document.modules[0].name = packageName;
  document.modules[0].items[0] = {
    ...document.modules[0].items[0],
    id: `interface:${packageName}`,
    name: `${typeName}Resource`,
    declaration: `export interface ${typeName}Resource`,
    owningAssembly: packageName,
  };
  document.declarations[0] = {
    id: `${packageName}:interface:${typeName}Resource`,
    content: `export interface ${typeName}Resource {}`,
    owningAssembly: packageName,
  };

  return parseTypeScriptApiExport(document, packageName);
}

function integrationWithDataVolumeOptions(
  packageName: string,
  volumePath: string,
): TypeScriptApiExport {
  const document = validDocumentForPackage(packageName);
  const typeId = `${packageName}/WithDataVolumeOptions`;

  document.modules[0].items[0] = {
    id: 'options:WithDataVolumeOptions',
    typeId,
    kind: 'options',
    name: 'WithDataVolumeOptions',
    declaration: 'export interface WithDataVolumeOptions',
    owningAssembly: packageName,
  };
  document.declarations[0] = {
    id: 'interface:WithDataVolumeOptions',
    // The shared property has incompatible literal types so these declarations only compile when
    // each package export remains a separate module.
    content: `export interface WithDataVolumeOptions { volumePath: '${volumePath}'; }`,
    owningAssembly: packageName,
  };

  return parseTypeScriptApiExport(document, packageName);
}

function validMember(): TypeScriptApiMember {
  return {
    id: 'method:addRedis',
    kind: 'method',
    name: 'addRedis',
    declaration: 'addRedis(name: string): RedisResource',
    capabilityId: 'Aspire.Hosting.Redis/addRedis',
    examples: ['const redis = await builder.addRedis("cache");'],
    parameters: [
      {
        name: 'name',
        type: 'string',
        optional: false,
        summary: 'The resource name.',
      },
    ],
  };
}

function expectRejected(mutate: (document: TypeScriptApiExport) => void, message: RegExp) {
  const document = validDocument();
  mutate(document);

  expect(() => parseTypeScriptApiExport(document, 'test-document')).toThrowError(
    TypeScriptApiExportError,
  );
  expect(() => parseTypeScriptApiExport(document, 'test-document')).toThrowError(message);
}

function getProcessErrorOutput(error: unknown): string {
  const processError = error as { stdout?: string; stderr?: string };
  const output = [processError.stdout, processError.stderr]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n');

  return output || String(error);
}

function expectedDeclarationText(document: TypeScriptApiExport): string {
  const declarationsById = new Map<string, TypeScriptApiExport['declarations'][number]>();

  for (const declaration of document.declarations) {
    const existing = declarationsById.get(declaration.id);
    if (existing !== undefined) {
      expect(declaration).toEqual(existing);
      continue;
    }

    declarationsById.set(declaration.id, declaration);
  }

  const declarations = [...declarationsById.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );

  return `${declarations.map((declaration) => declaration.content).join('\n')}\n`;
}

describe('process error output', () => {
  it('uses stderr when stdout is empty', () => {
    expect(getProcessErrorOutput({ stdout: '', stderr: 'compiler error' })).toBe('compiler error');
  });

  it('falls back to the error text when the process has no output streams', () => {
    expect(getProcessErrorOutput(new Error('process failed'))).toContain('process failed');
  });
});

describe('typescript-api-export schema version 1', () => {
  it('accepts the canonical fixtures produced by aspire sdk export', () => {
    expect(core.schemaVersion).toBe(1);
    expect(core.language).toBe('typescript');
    expect(core.package.name).toBe('Aspire.Hosting');
    expect(core.package.version.length).toBeGreaterThan(0);

    expect(integration.package.name).toBe('Aspire.Hosting.Redis');
    expect(integration.modules.length).toBeGreaterThan(0);
  });

  it('rejects an unknown schema version', () => {
    expectRejected((document) => {
      (document as { schemaVersion: number }).schemaVersion = 2;
    }, /schema version/i);
  });

  it('rejects a document for another language', () => {
    expectRejected((document) => {
      (document as { language: string }).language = 'python';
    }, /language/i);
  });

  it('preserves the producer generator identity', () => {
    const document = validDocument();

    const parsed = parseTypeScriptApiExport(document, 'test-document');

    expect(parsed.generator).toEqual(document.generator);
  });

  it('rejects missing generator identity', () => {
    expectRejected((document) => {
      delete (document as Partial<TypeScriptApiExport>).generator;
    }, /generator/i);
  });

  it('rejects missing package identity', () => {
    expectRejected((document) => {
      document.package.version = '';
    }, /package/i);
  });

  it('rejects duplicate stable item IDs', () => {
    expectRejected((document) => {
      const [item] = document.modules[0].items;
      document.modules[0].items.push({ ...item });
    }, /duplicate/i);
  });

  it('rejects an item without a typeId', () => {
    expectRejected((document) => {
      delete (document.modules[0].items[0] as Partial<TypeScriptApiItem>).typeId;
    }, /typeId/i);
  });

  it('rejects an unknown item kind', () => {
    expectRejected((document) => {
      (document.modules[0].items[0] as { kind: string }).kind = 'class';
    }, /modules\[0\]\.items\[0\]\.kind/);
  });

  it('rejects an unknown member kind', () => {
    expectRejected((document) => {
      const member = validMember();
      (member as { kind: string }).kind = 'event';
      document.modules[0].items[0].members = [member];
    }, /modules\[0\]\.items\[0\]\.members\[0\]\.kind/);
  });

  it('rejects duplicate declaration IDs that disagree on content', () => {
    expectRejected((document) => {
      const [declaration] = document.declarations;
      document.declarations.push({ ...declaration, content: 'export interface RedisResource {}' });
    }, /duplicate/i);
  });

  it('rejects a non-final signature', () => {
    expectRejected((document) => {
      document.modules[0].items[0].declaration = '';
    }, /declaration/i);
  });

  it('rejects an item whose members carry no final declaration', () => {
    expectRejected((document) => {
      document.modules[0].items[0].members = [{ id: 'method:withHostPort', kind: 'method', name: 'withHostPort', declaration: '' }];
    }, /declaration/i);
  });

  it('preserves producer-owned member metadata', () => {
    const document = validDocument();
    const member = validMember();
    document.modules[0].items[0].members = [member];

    const parsed = parseTypeScriptApiExport(document, 'test-document');
    const parsedMember = parsed.modules[0].items[0].members?.[0];

    expect(parsedMember?.capabilityId).toBe(member.capabilityId);
    expect(parsedMember?.examples).toEqual(member.examples);
    expect(parsedMember?.parameters).toEqual(member.parameters);
    expect(parsedMember?.remarks).toBeUndefined();
  });

  it('rejects a member parameter whose optional flag is not boolean', () => {
    const document = validDocument();
    const member = validMember();
    (member.parameters?.[0] as { optional: unknown }).optional = 'false';
    document.modules[0].items[0].members = [member];

    expect(() => parseTypeScriptApiExport(document, 'test-document')).toThrowError(
      TypeScriptApiExportError,
    );
    expect(() => parseTypeScriptApiExport(document, 'test-document')).toThrowError(
      /\.parameters\[0\]\.optional/,
    );
  });

  it('rejects a member parameter with an empty type', () => {
    const document = validDocument();
    const member = validMember();
    member.parameters![0].type = '';
    document.modules[0].items[0].members = [member];

    expect(() => parseTypeScriptApiExport(document, 'test-document')).toThrowError(
      TypeScriptApiExportError,
    );
    expect(() => parseTypeScriptApiExport(document, 'test-document')).toThrowError(
      /\.parameters\[0\]\.type/,
    );
  });
});

describe('two-package manifests', () => {
  it('does not duplicate core-owned documentation pages in the integration package', () => {
    const coreTypeIds = new Set(
      core.modules.flatMap((module) =>
        module.items.filter((item) => item.kind !== 'augmentation').map((item) => item.typeId),
      ),
    );
    const integrationTypeIds = integration.modules.flatMap((module) =>
      module.items.filter((item) => item.kind !== 'augmentation').map((item) => item.typeId),
    );

    expect(integrationTypeIds.length).toBeGreaterThan(0);
    expect(integrationTypeIds.filter((typeId) => coreTypeIds.has(typeId))).toEqual([]);
  });

  it('documents only package-owned symbols while referenced types stay in declarations', () => {
    const items = integration.modules.flatMap((module) => module.items);

    const ownedItemOwners = new Set(
      items.filter((item) => item.kind !== 'augmentation').map((item) => item.owningAssembly),
    );
    expect([...ownedItemOwners]).toEqual(['Aspire.Hosting.Redis']);

    // The closure still has to supply the core types the integration's signatures name, otherwise
    // the concatenated declarations could not type-check.
    const declarationOwners = new Set(
      integration.declarations.map((declaration) => declaration.owningAssembly),
    );
    expect(declarationOwners.has('Aspire.Hosting')).toBe(true);
  });

  it('exposes extension methods as augmentations of the owning package\'s type', () => {
    const augmentations = integration.modules
      .flatMap((module) => module.items)
      .filter((item) => item.kind === 'augmentation');

    expect(augmentations.length).toBeGreaterThan(0);

    for (const augmentation of augmentations) {
      // The owning package publishes the page for the type; this item only carries the members this
      // package contributes, so it must point back at the real owner and never reuse its item ID.
      // The contributing package is part of the ID too, because every integration that extends
      // DistributedApplicationBuilder augments the same interface name.
      expect(augmentation.owningAssembly).not.toBe(integration.package.name);
      expect(augmentation.id.startsWith(`augmentation:${integration.package.name}:`)).toBe(true);
      expect(augmentation.members?.length ?? 0).toBeGreaterThan(0);
    }

    const addRedis = augmentations
      .flatMap((item) => item.members ?? [])
      .find((member) => member.name === 'addRedis');
    expect(addRedis?.declaration).toContain('addRedis(');
  });

  it('allows Redis and Mongo exports to share item and declaration IDs', () => {
    const redis = integrationWithDataVolumeOptions('Aspire.Hosting.Redis', 'redisPath');
    const mongo = integrationWithDataVolumeOptions('Aspire.Hosting.MongoDB', 'mongoPath');

    expect(redis.modules[0].items[0].id).toBe(mongo.modules[0].items[0].id);
    expect(redis.modules[0].items[0].name).toBe(mongo.modules[0].items[0].name);
    expect(redis.modules[0].items[0].typeId).not.toBe(mongo.modules[0].items[0].typeId);
    expect(redis.declarations[0].id).toBe(mongo.declarations[0].id);
    expect(redis.declarations[0].content).not.toBe(mongo.declarations[0].content);
    expect(() => concatenateDeclarations(redis)).not.toThrow();
    expect(() => concatenateDeclarations(mongo)).not.toThrow();
  });

  it('deduplicates and orders declaration IDs within each package export', () => {
    for (const document of [core, integration]) {
      const ids = concatenateDeclarations(document).declarations.map(
        (declaration) => declaration.id,
      );

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([...ids].sort());
    }
  });
});

const typecheckDir = mkdtempSync(join(tmpdir(), 'ts-api-export-'));

afterAll(() => {
  rmSync(typecheckDir, { recursive: true, force: true });
});

describe('combined declaration fragments', () => {
  it('type-checks with noEmit and skipLibCheck disabled', () => {
    const documents = [
      core,
      integration,
      integrationWithDataVolumeOptions('Aspire.Hosting.Redis.Options', 'redisPath'),
      integrationWithDataVolumeOptions('Aspire.Hosting.MongoDB.Options', 'mongoPath'),
    ];
    const files = documents.map((document, index) => {
      const fileName = `declarations-${index}.ts`;
      writeFileSync(join(typecheckDir, fileName), concatenateDeclarations(document).text, 'utf8');
      return fileName;
    });
    const tsconfig = join(typecheckDir, 'tsconfig.json');

    writeFileSync(
      tsconfig,
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          skipLibCheck: false,
          target: 'ES2022',
          lib: ['ES2022'],
          types: [],
        },
        files,
      }),
      'utf8',
    );

    const tsc = fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url));

    let output = '';
    try {
      execFileSync(process.execPath, [tsc, '--project', tsconfig], { encoding: 'utf8' });
    } catch (error) {
      output = getProcessErrorOutput(error);
    }

    expect(output).toBe('');
  });

  it('deduplicates exact repeats without authoring shims', () => {
    const integrationWithExactRepeat = {
      ...integration,
      declarations: [...integration.declarations, { ...integration.declarations[0] }],
    };
    const documents = [
      core,
      integrationWithExactRepeat,
      integrationWithDataVolumeOptions('Aspire.Hosting.Redis.Options', 'redisPath'),
      integrationWithDataVolumeOptions('Aspire.Hosting.MongoDB.Options', 'mongoPath'),
    ];

    // A shim would show up as a declaration the export never produced, so the concatenation must be
    // byte-identical to the fragments themselves.
    for (const document of documents) {
      expect(concatenateDeclarations(document).text).toBe(expectedDeclarationText(document));
    }
  });
});

describe('loader', () => {
  it('reports the file that failed validation', () => {
    const broken = join(typecheckDir, 'broken.json');
    writeFileSync(broken, JSON.stringify({ schemaVersion: 99 }), 'utf8');

    expect(() => loadTypeScriptApiExport(broken)).toThrowError(/broken\.json/);
  });

  it('rejects stdout that is not exactly one export document', () => {
    const document = JSON.parse(readFileSync(integrationPath, 'utf8'));

    expect(() => parseTypeScriptApiExport([document], 'stdout')).toThrowError(
      TypeScriptApiExportError,
    );
  });
});
