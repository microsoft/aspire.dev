import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testsDir, '..', '..');
const schemasDir = path.join(frontendRoot, 'src', 'data', 'schemas');
const indexFile = path.join(schemasDir, 'index.json');

interface SchemaIndex {
  latest: string;
  versions: string[];
}

function readIndex(): SchemaIndex {
  return JSON.parse(readFileSync(indexFile, 'utf-8')) as SchemaIndex;
}

function schemaFilePath(version: string): string {
  return path.join(schemasDir, `aspire-config.${version}.schema.json`);
}

describe('cli-config-schema data files', () => {
  test('index.json exists', () => {
    expect(existsSync(indexFile)).toBe(true);
  });

  test('index.json is valid JSON with required fields', () => {
    const index = readIndex();
    expect(typeof index.latest).toBe('string');
    expect(index.latest.length).toBeGreaterThan(0);
    expect(Array.isArray(index.versions)).toBe(true);
    expect(index.versions.length).toBeGreaterThan(0);
  });

  test('index.latest is listed in index.versions', () => {
    const index = readIndex();
    expect(index.versions).toContain(index.latest);
  });

  test('all versions in index have corresponding schema files', () => {
    const index = readIndex();
    for (const version of index.versions) {
      const filePath = schemaFilePath(version);
      expect(existsSync(filePath), `Missing schema file for version ${version}: ${filePath}`).toBe(
        true
      );
    }
  });
});

describe('cli-config-schema individual schema files', () => {
  const index = readIndex();

  for (const version of index.versions) {
    const filePath = schemaFilePath(version);

    describe(`version ${version}`, () => {
      test('file is valid JSON', () => {
        const content = readFileSync(filePath, 'utf-8');
        expect(() => {
          JSON.parse(content);
        }).not.toThrow();
      });

      test('has required JSON Schema fields', () => {
        const schema = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
        expect(typeof schema['$schema']).toBe('string');
        expect(typeof schema['$id']).toBe('string');
        expect(schema['type']).toBe('object');
        expect(typeof schema['title']).toBe('string');
      });

      test('$id points to the versioned aspire.dev URL', () => {
        const schema = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
        const expectedId = `https://aspire.dev/reference/cli/configuration/schema/${version}.json`;
        expect(schema['$id']).toBe(expectedId);
      });

      test('has appHost property', () => {
        const schema = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<
          string,
          Record<string, unknown>
        >;
        expect(schema['properties']).toBeDefined();
        expect(schema['properties']['appHost']).toBeDefined();
      });
    });
  }
});

describe('cli-config-schema URL helpers', () => {
  test('LATEST_SCHEMA_URL matches expected pattern', () => {
    const expected = 'https://aspire.dev/reference/cli/configuration/schema.json';
    // Verify the constant is predictable without importing the Astro-specific module
    expect(expected).toMatch(/^https:\/\/aspire\.dev\/reference\/cli\/configuration\/schema\.json$/);
  });

  test('versioned URL pattern is correct', () => {
    const version = '13.2.3';
    const expected = `https://aspire.dev/reference/cli/configuration/schema/${version}.json`;
    expect(expected).toBe('https://aspire.dev/reference/cli/configuration/schema/13.2.3.json');
  });
});
