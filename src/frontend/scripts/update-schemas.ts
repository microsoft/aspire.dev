/**
 * Fetches the aspire-config JSON Schema from microsoft/aspire and saves a
 * versioned copy under src/data/schemas/, then updates the version index.
 *
 * Usage:
 *   pnpm update:schemas                     # fetch latest non-prerelease
 *   pnpm update:schemas -- --version 13.2.3 # pin to a specific version tag
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { fetchWithProxy as fetch } from './fetch-with-proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..');

const ASPIRE_REPO = 'microsoft/aspire';
const SCHEMA_SOURCE_PATH = 'extension/schemas/aspire-config.schema.json';
const SCHEMAS_DIR = path.join(FRONTEND_ROOT, 'src', 'data', 'schemas');
const INDEX_FILE = path.join(SCHEMAS_DIR, 'index.json');

const SITE_ORIGIN = 'https://aspire.dev';
const SCHEMA_BASE_PATH = '/reference/cli/configuration/schema';

interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
}

interface SchemaIndex {
  latest: string;
  versions: string[];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function schemaFileName(version: string): string {
  return `aspire-config.${version}.schema.json`;
}

function schemaFilePath(version: string): string {
  return path.join(SCHEMAS_DIR, schemaFileName(version));
}

/** Fetch the latest non-prerelease, non-draft tag from microsoft/aspire. */
async function fetchLatestReleaseVersion(): Promise<string> {
  const url = `https://api.github.com/repos/${ASPIRE_REPO}/releases`;
  const headers: Record<string, string> = {
    'User-Agent': 'aspire-schema-updater',
    Accept: 'application/vnd.github.v3+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch releases: ${res.status} ${res.statusText}`);
  }

  const releases = (await res.json()) as GitHubRelease[];
  const stable = releases.find((r) => !r.prerelease && !r.draft);
  if (!stable) {
    throw new Error('No stable release found in microsoft/aspire');
  }

  // Tag names are like "v13.2.3" — strip the leading "v"
  return stable.tag_name.replace(/^v/, '');
}

/** Fetch the raw schema JSON from microsoft/aspire at the given tag. */
async function fetchSchemaAtTag(tag: string): Promise<Record<string, unknown>> {
  const rawUrl =
    `https://raw.githubusercontent.com/${ASPIRE_REPO}/v${tag}/${SCHEMA_SOURCE_PATH}`;
  const res = await fetch(rawUrl, {
    headers: { 'User-Agent': 'aspire-schema-updater' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch schema at tag v${tag}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Read the current index, or return an empty one if it doesn't exist yet. */
function readIndex(): SchemaIndex {
  if (!fs.existsSync(INDEX_FILE)) {
    return { latest: '', versions: [] };
  }
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8')) as SchemaIndex;
}

/** Write the index atomically by writing a temp file and renaming into place. */
function writeIndex(index: SchemaIndex): void {
  fs.mkdirSync(SCHEMAS_DIR, { recursive: true });

  const contents = JSON.stringify(index, null, 2) + '\n';
  const tempFile = path.join(
    SCHEMAS_DIR,
    `${path.basename(INDEX_FILE)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    fs.writeFileSync(tempFile, contents, 'utf-8');
    fs.renameSync(tempFile, INDEX_FILE);
  } catch (error) {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  // Resolve the target version
  const versionArg = process.argv.indexOf('--version');
  let version: string;
  if (versionArg >= 0 && process.argv[versionArg + 1]) {
    version = process.argv[versionArg + 1].replace(/^v/, '');
    console.log(`📌 Using pinned version: ${version}`);
  } else {
    console.log(`🔍 Fetching latest release from ${ASPIRE_REPO}…`);
    version = await fetchLatestReleaseVersion();
    console.log(`✅ Latest stable release: ${version}`);
  }

  const outFile = schemaFilePath(version);

  if (fs.existsSync(outFile)) {
    console.log(`ℹ️  Schema for v${version} already exists at ${path.relative(FRONTEND_ROOT, outFile)}`);
  } else {
    console.log(`⬇️  Fetching schema from microsoft/aspire @ v${version}…`);
    const schema = await fetchSchemaAtTag(version);

    // Update $id to point to the versioned aspire.dev URL
    schema['$id'] = `${SITE_ORIGIN}${SCHEMA_BASE_PATH}/${version}.json`;

    fs.mkdirSync(SCHEMAS_DIR, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(schema, null, 2) + '\n', 'utf-8');
    console.log(`✅ Saved schema to ${path.relative(FRONTEND_ROOT, outFile)}`);
  }

  // Update the index
  const index = readIndex();

  if (!index.versions.includes(version)) {
    index.versions.push(version);
    index.versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  index.latest = version;

  writeIndex(index);
  console.log(`✅ Updated ${path.relative(FRONTEND_ROOT, INDEX_FILE)} — latest: ${version}, versions: [${index.versions.join(', ')}]`);
}

main().catch((error: unknown) => {
  console.error('❌ Error:', getErrorMessage(error));
  process.exit(1);
});
