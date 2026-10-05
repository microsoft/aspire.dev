import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
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

  test('index.versions is unique and sorted oldest to newest', () => {
    const index = readIndex();
    expect(new Set(index.versions).size).toBe(index.versions.length);
    expect(index.versions).toEqual([...index.versions].sort(compareVersions));
  });

  test('index.latest is the highest version', () => {
    const index = readIndex();
    const sorted = [...index.versions].sort(compareVersions);
    expect(index.latest).toBe(sorted[sorted.length - 1]);
  });

  test('every schema file is listed in index.json', () => {
    const index = readIndex();
    const fileVersions = readdirSync(schemasDir).flatMap((name) => {
      const version = /^aspire-config\.(.+)\.schema\.json$/.exec(name)?.[1];
      return version ? [version] : [];
    });
    expect(fileVersions.sort(compareVersions)).toEqual([...index.versions].sort(compareVersions));
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
