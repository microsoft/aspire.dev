import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { LATEST_SCHEMA_URL, versionedSchemaUrl } from '../../src/utils/cli-config-schema';

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
  test('files are valid JSON', () => {
    const index = readIndex();

    for (const version of index.versions) {
      const filePath = schemaFilePath(version);
      const content = readFileSync(filePath, 'utf-8');
      expect(() => {
        JSON.parse(content);
      }).not.toThrow();
    }
  });

  test('files have required JSON Schema fields', () => {
    const index = readIndex();

    for (const version of index.versions) {
      const filePath = schemaFilePath(version);
      const schema = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      expect(typeof schema['$schema']).toBe('string');
      expect(typeof schema['$id']).toBe('string');
      expect(schema['type']).toBe('object');
      expect(typeof schema['title']).toBe('string');
    }
  });

  test("files' $id points to the versioned aspire.dev URL", () => {
    const index = readIndex();

    for (const version of index.versions) {
      const filePath = schemaFilePath(version);
      const schema = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      const expectedId = `https://aspire.dev/reference/cli/configuration/schema/${version}.json`;
      expect(schema['$id']).toBe(expectedId);
    }
  });

  test('files have appHost property', () => {
    const index = readIndex();

    for (const version of index.versions) {
      const filePath = schemaFilePath(version);
      const schema = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<
        string,
        Record<string, unknown>
      >;
      expect(schema['properties']).toBeDefined();
      expect(schema['properties']['appHost']).toBeDefined();
    }
  });
});

describe('cli-config-schema URL helpers', () => {
  test('LATEST_SCHEMA_URL points to the canonical latest schema URL', () => {
    expect(LATEST_SCHEMA_URL).toBe('https://aspire.dev/reference/cli/configuration/schema.json');
  });

  test('versionedSchemaUrl() produces the canonical versioned URL', () => {
    expect(versionedSchemaUrl('13.2.3')).toBe(
      'https://aspire.dev/reference/cli/configuration/schema/13.2.3.json'
    );
  });

  test('versionedSchemaUrl() round-trips each indexed version', () => {
    const index = readIndex();

    for (const version of index.versions) {
      expect(versionedSchemaUrl(version)).toBe(
        `https://aspire.dev/reference/cli/configuration/schema/${version}.json`
      );
    }
  });
});
