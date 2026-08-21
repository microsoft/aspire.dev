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

function expectRejected(mutate: (document: TypeScriptApiExport) => void, message: RegExp) {
  const document = validDocument();
  mutate(document);

  expect(() => parseTypeScriptApiExport(document, 'test-document')).toThrowError(
    TypeScriptApiExportError,
  );
  expect(() => parseTypeScriptApiExport(document, 'test-document')).toThrowError(message);
}

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
});

describe('two-package manifests', () => {
  it('does not duplicate core-owned documentation pages in the integration package', () => {
    const coreItemIds = new Set(core.modules.flatMap((module) => module.items.map((item) => item.id)));
    const integrationItemIds = integration.modules.flatMap((module) => module.items.map((item) => item.id));

    expect(integrationItemIds.length).toBeGreaterThan(0);
    expect(integrationItemIds.filter((id) => coreItemIds.has(id))).toEqual([]);
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

  it('keeps item IDs unique across a multi-package manifest', () => {
    // We key pages off item IDs, so a collision between two packages silently drops one of them.
    // An earlier build emitted `interface:DistributedApplicationBuilder` from every integration.
    const ids = [core, integration]
      .flatMap((document) => document.modules)
      .flatMap((module) => module.items)
      .map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every declaration ID referenced across the manifest exactly once', () => {
    const combined = concatenateDeclarations([core, integration]);
    const ids = combined.declarations.map((declaration) => declaration.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });
});

const typecheckDir = mkdtempSync(join(tmpdir(), 'ts-api-export-'));

afterAll(() => {
  rmSync(typecheckDir, { recursive: true, force: true });
});

describe('combined declaration fragments', () => {
  it('type-checks with noEmit and skipLibCheck disabled', () => {
    const { text } = concatenateDeclarations([core, integration]);

    const entry = join(typecheckDir, 'declarations.ts');
    const tsconfig = join(typecheckDir, 'tsconfig.json');

    writeFileSync(entry, text, 'utf8');
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
        files: ['declarations.ts'],
      }),
      'utf8',
    );

    const tsc = fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url));

    let output = '';
    try {
      execFileSync(process.execPath, [tsc, '--project', tsconfig], { encoding: 'utf8' });
    } catch (error) {
      output = (error as { stdout?: string }).stdout ?? String(error);
    }

    expect(output).toBe('');
  });

  it('writes fragments the site can consume without authoring shims', () => {
    const { text } = concatenateDeclarations([core, integration]);

    // A shim would show up as a declaration the export never produced, so the concatenation must be
    // byte-identical to the fragments themselves.
    const fragments = [...core.declarations, ...integration.declarations];
    for (const fragment of fragments) {
      expect(text).toContain(fragment.content);
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
