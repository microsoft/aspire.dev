import type { SchemaIndex } from './cli-config-schema-types';

export type { SchemaIndex };

const SITE_ORIGIN = 'https://aspire.dev';
const SCHEMA_BASE_PATH = '/reference/cli/configuration/schema';

/** Canonical URL for the always-latest schema. */
export const LATEST_SCHEMA_URL = `${SITE_ORIGIN}${SCHEMA_BASE_PATH}.json`;

/** Canonical URL for a specific versioned schema. */
export function versionedSchemaUrl(version: string): string {
  return `${SITE_ORIGIN}${SCHEMA_BASE_PATH}/${version}.json`;
}

/**
 * All versioned schema files eagerly imported at build time.
 * Keys are relative paths like `../../data/schemas/aspire-config.13.2.3.schema.json`.
 */
const schemaModules = import.meta.glob<{ default: Record<string, unknown> }>(
  '/src/data/schemas/aspire-config.*.schema.json',
  { eager: true }
);

/**
 * Parse the version from a schema module key.
 * Key format: `/src/data/schemas/aspire-config.{version}.schema.json`
 */
function parseVersionFromKey(key: string): string | null {
  const match = key.match(/aspire-config\.(.+)\.schema\.json$/);
  return match ? match[1] : null;
}

/**
 * Build a map from version string → schema object from the eagerly loaded modules.
 */
function buildSchemaMap(): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const [key, mod] of Object.entries(schemaModules)) {
    const version = parseVersionFromKey(key);
    if (version) {
      map.set(version, mod.default);
    }
  }
  return map;
}

let _schemaMap: Map<string, Record<string, unknown>> | undefined;

function getSchemaMap(): Map<string, Record<string, unknown>> {
  _schemaMap ??= buildSchemaMap();
  return _schemaMap;
}

/**
 * Load the schema index (`src/data/schemas/index.json`).
 */
export async function getSchemaIndex(): Promise<SchemaIndex> {
  const mod = (await import('/src/data/schemas/index.json')) as { default: SchemaIndex };
  return mod.default;
}

/**
 * All known CLI config schema versions from the schema index, sorted newest-first.
 *
 * Using `index.json` (rather than the globbed schema files) as the source of
 * truth ensures the versioned endpoint only exposes schemas declared in the
 * index — `latest` and the served version set stay aligned.
 *
 * `localeCompare` with `numeric: true` treats digit sequences as numbers,
 * so "9.0.9" < "9.0.10" < "10.0.0" — correct for semver-style version strings.
 */
export async function getSchemaVersions(): Promise<string[]> {
  const index = await getSchemaIndex();
  return [...index.versions].sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  );
}

/**
 * Return the schema for a given version, or `null` if not found.
 * The `$id` is set to the versioned canonical URL.
 */
export function getSchemaByVersion(version: string): Record<string, unknown> | null {
  const schema = getSchemaMap().get(version);
  if (!schema) return null;
  return { ...schema, $id: versionedSchemaUrl(version) };
}

/**
 * Return the latest schema with `$id` set to the always-latest canonical URL.
 */
export async function getLatestSchema(): Promise<Record<string, unknown>> {
  const index = await getSchemaIndex();
  const schema = getSchemaMap().get(index.latest);
  if (!schema) {
    throw new Error(`Latest schema version ${index.latest} not found in data/schemas/`);
  }
  return { ...schema, $id: LATEST_SCHEMA_URL };
}
