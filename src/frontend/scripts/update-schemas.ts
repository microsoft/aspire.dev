/**
 * Generates the aspire-config JSON Schema for each stable microsoft/aspire
 * release into versioned copies under src/data/schemas/, then updates the
 * version index.
 *
 * Every stable (non-prerelease, non-draft) microsoft/aspire release from 13.2.0
 * on gets its own copy, so pinned
 * https://aspire.dev/reference/cli/configuration/schema/<version>.json URLs
 * resolve for any shipped release. Each schema is generated from that release's
 * own Aspire CLI: the script installs the Aspire.Cli .NET tool at the release
 * version, reads `aspire config info --json`, and builds the schema the same
 * way as microsoft/aspire's extension/scripts/generate-schema.js. The schema
 * file checked in to microsoft/aspire isn't used, because it wasn't regenerated
 * for the 13.3 and 13.4 releases and doesn't match their CLI.
 *
 * A release's schema never changes after it ships, so existing copies are never
 * regenerated or overwritten, and the index's `latest` is always the highest
 * version. The scheduled Integration Data Updater workflow runs this script
 * through `pnpm update:all`, so new releases are picked up automatically, and it
 * rejects any change to an existing copy.
 *
 * Requires the .NET SDK on PATH.
 *
 * Usage:
 *   pnpm update:schemas                       # sync every stable release
 *   pnpm update:schemas -- --version 13.2.3   # sync a single released version, 13.2.0 or later
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { fetchWithProxy as fetch } from './fetch-with-proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..');

const ASPIRE_REPO = 'microsoft/aspire';
const CLI_PACKAGE_ID = 'Aspire.Cli';
const SCHEMAS_DIR = path.join(FRONTEND_ROOT, 'src', 'data', 'schemas');
const INDEX_FILE = path.join(SCHEMAS_DIR, 'index.json');

const SITE_ORIGIN = 'https://aspire.dev';
const SCHEMA_BASE_PATH = '/reference/cli/configuration/schema';

/** The first microsoft/aspire release that ships the schema. */
const MIN_SCHEMA_VERSION = '13.2.0';

/** Stable tags are `v<major>.<minor>.<patch>`; 13.4.4 was tagged `v13.4.4-release`. */
const STABLE_RELEASE_TAG = /^v(\d+\.\d+\.\d+)(?:-release)?$/;

const RELEASES_PAGE_SIZE = 100;

interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
}

interface SchemaIndex {
  latest: string;
  versions: string[];
}

/** A property from `aspire config info --json`. */
interface ConfigPropertyInfo {
  name: string;
  type: string;
  description: string;
  required: boolean;
  subProperties?: ConfigPropertyInfo[];
  additionalPropertiesType?: string;
}

/** A feature flag from `aspire config info --json`. */
interface ConfigFeatureInfo {
  name: string;
  description: string;
  defaultValue: boolean;
}

interface ConfigInfo {
  availableFeatures: ConfigFeatureInfo[];
  configFileProperties: ConfigPropertyInfo[];
}

type JsonObject = Record<string, unknown>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Compare versions numerically, so 13.10.0 sorts after 13.9.0. */
function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

function getArgValue(name: string): string | undefined {
  const argIndex = process.argv.indexOf(name);
  return argIndex >= 0 ? process.argv[argIndex + 1] : undefined;
}

function schemaFileName(version: string): string {
  return `aspire-config.${version}.schema.json`;
}

function schemaFilePath(version: string): string {
  return path.join(SCHEMAS_DIR, schemaFileName(version));
}

/** Fetch every stable microsoft/aspire release version that ships the schema, oldest first. */
async function fetchStableSchemaVersions(): Promise<string[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'aspire-schema-updater',
    Accept: 'application/vnd.github.v3+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  const versions = new Set<string>();
  for (let page = 1; ; page++) {
    const url =
      `https://api.github.com/repos/${ASPIRE_REPO}/releases` +
      `?per_page=${RELEASES_PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch releases: ${res.status} ${res.statusText}`);
    }

    const releases = (await res.json()) as GitHubRelease[];
    for (const release of releases) {
      if (release.prerelease || release.draft) {
        continue;
      }

      const version = STABLE_RELEASE_TAG.exec(release.tag_name)?.[1];
      if (!version) {
        console.warn(`⚠️  Skipping stable release with an unrecognized tag: ${release.tag_name}`);
        continue;
      }

      if (compareVersions(version, MIN_SCHEMA_VERSION) >= 0) {
        versions.add(version);
      }
    }

    if (releases.length < RELEASES_PAGE_SIZE) {
      break;
    }
  }

  if (versions.size === 0) {
    throw new Error(`No stable ${ASPIRE_REPO} release found at or after ${MIN_SCHEMA_VERSION}`);
  }

  return [...versions].sort(compareVersions);
}

function readField(source: JsonObject, name: string): unknown {
  return source[name] ?? source[name.charAt(0).toUpperCase() + name.slice(1)];
}

function readArray(source: JsonObject, name: string): JsonObject[] {
  const value = readField(source, name);
  if (!Array.isArray(value)) {
    throw new Error(`Expected config info ${name} to be an array.`);
  }
  return value as JsonObject[];
}

function readString(source: JsonObject, name: string): string {
  const value = readField(source, name);
  if (typeof value !== 'string') {
    throw new Error(`Expected config info ${name} to be a string.`);
  }
  return value;
}

function readBoolean(source: JsonObject, name: string): boolean {
  const value = readField(source, name);
  if (typeof value !== 'boolean') {
    throw new Error(`Expected config info ${name} to be a boolean.`);
  }
  return value;
}

/** Normalize a property; the CLI emits PascalCase in 13.2 and camelCase from 13.3 on. */
function normalizeProperty(property: JsonObject): ConfigPropertyInfo {
  const subProperties = readField(property, 'subProperties');
  const additionalPropertiesType = readField(property, 'additionalPropertiesType');
  return {
    name: readString(property, 'name'),
    type: readString(property, 'type'),
    description: readString(property, 'description'),
    required: readBoolean(property, 'required'),
    ...(subProperties == null
      ? {}
      : { subProperties: readArray(property, 'subProperties').map(normalizeProperty) }),
    ...(additionalPropertiesType == null
      ? {}
      : { additionalPropertiesType: readString(property, 'additionalPropertiesType') }),
  };
}

function normalizeConfigInfo(raw: JsonObject): ConfigInfo {
  const configFileSchema = readField(raw, 'configFileSchema') as JsonObject | undefined;
  if (!configFileSchema) {
    throw new Error('The CLI config info output has no aspire.config.json schema.');
  }

  return {
    availableFeatures: readArray(raw, 'availableFeatures').map((feature) => ({
      name: readString(feature, 'name'),
      description: readString(feature, 'description'),
      defaultValue: readBoolean(feature, 'defaultValue'),
    })),
    configFileProperties: readArray(configFileSchema, 'properties').map(normalizeProperty),
  };
}

/** Run a command and return its stdout, including its output in the error when it fails. */
function runCommand(
  description: string,
  file: string,
  args: string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv; shell?: boolean }
): string {
  try {
    return execFileSync(file, args, {
      ...options,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    const output = [stdout, stderr]
      .map((stream) => stream?.trim())
      .filter(Boolean)
      .join('\n');
    // Node's message repeats stderr after its first line, so keep only the summary.
    const summary = getErrorMessage(error).split('\n')[0];
    throw new Error(`${description} failed: ${summary}${output ? `\n${output}` : ''}`, {
      cause: error,
    });
  }
}

/** Return the outermost JSON object in the CLI output, ignoring any text around it. */
function extractJsonObject(output: string, description: string): JsonObject {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end < start) {
    throw new Error(`${description} didn't print a JSON object. Output:\n${output.trim()}`);
  }

  try {
    return JSON.parse(output.slice(start, end + 1)) as JsonObject;
  } catch (error) {
    throw new Error(
      `${description} printed invalid JSON: ${getErrorMessage(error)}. Output:\n${output.trim()}`,
      { cause: error }
    );
  }
}

/** Install the released Aspire CLI in a temporary directory and read `aspire config info --json`. */
function readReleasedConfigInfo(version: string): ConfigInfo {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `aspire-cli-${version}-`));
  const toolDir = path.join(tempDir, 'tool');
  const workDir = path.join(tempDir, 'work');
  fs.mkdirSync(workDir);

  const env = {
    ...process.env,
    ASPIRE_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1',
  };

  try {
    runCommand(
      `Installing ${CLI_PACKAGE_ID} ${version}`,
      'dotnet',
      ['tool', 'install', CLI_PACKAGE_ID, '--version', version, '--tool-path', toolDir],
      { env }
    );

    // 13.2 installs aspire.exe on Windows; later releases install an aspire.cmd shim.
    const cli = ['aspire.exe', 'aspire.cmd', 'aspire']
      .map((name) => path.join(toolDir, name))
      .find((candidate) => fs.existsSync(candidate));
    if (!cli) {
      throw new Error(`The ${CLI_PACKAGE_ID} ${version} tool has no aspire executable.`);
    }

    // Node only runs .cmd files through a shell; the arguments are fixed literals.
    const description = `Running aspire config info --json with ${CLI_PACKAGE_ID} ${version}`;
    const output = runCommand(description, cli, ['config', 'info', '--json'], {
      cwd: workDir,
      env,
      shell: cli.endsWith('.cmd'),
    });

    return normalizeConfigInfo(extractJsonObject(output, description));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const BOOLEAN_SCHEMA = [{ type: 'boolean' }, { type: 'string', enum: ['true', 'false'] }];

/** Mirrors createPropertySchema in microsoft/aspire's extension/scripts/generate-schema.js. */
function createPropertySchema(prop: ConfigPropertyInfo, info: ConfigInfo): JsonObject {
  const schema: JsonObject = { description: prop.description };
  const type = prop.type.toLowerCase();

  if (type === 'string') {
    schema.type = 'string';
  } else if (type === 'boolean') {
    schema.anyOf = BOOLEAN_SCHEMA;
  } else if (type === 'number' || type === 'integer') {
    schema.type = type;
  } else if (type === 'array') {
    schema.type = 'array';
    schema.items = {};
  } else if (type === 'object') {
    schema.type = 'object';

    if (prop.name === 'features') {
      const properties: JsonObject = {};
      for (const feature of info.availableFeatures) {
        properties[feature.name] = {
          anyOf: BOOLEAN_SCHEMA,
          description: feature.description,
          default: feature.defaultValue,
        };
      }
      schema.properties = properties;
      schema.additionalProperties = false;
    } else if (prop.subProperties && prop.subProperties.length > 0) {
      const properties: JsonObject = {};
      for (const subProp of prop.subProperties) {
        properties[subProp.name] = createPropertySchema(subProp, info);
      }

      if (prop.additionalPropertiesType === 'object') {
        schema.additionalProperties = {
          type: 'object',
          properties,
          additionalProperties: false,
        };
      } else {
        schema.properties = properties;
        schema.additionalProperties = false;
      }
    } else if (prop.additionalPropertiesType) {
      schema.additionalProperties = { type: prop.additionalPropertiesType };
    } else if (prop.name === 'packages') {
      schema.additionalProperties = { type: 'string', description: 'Package version' };
    } else {
      schema.additionalProperties = true;
    }
  } else {
    schema.type = 'string';
  }

  return schema;
}

/** Mirrors generateJsonSchema in microsoft/aspire's extension/scripts/generate-schema.js. */
function generateSchema(version: string, info: ConfigInfo): JsonObject {
  const properties: JsonObject = {};
  const required: string[] = [];
  for (const prop of info.configFileProperties) {
    properties[prop.name] = createPropertySchema(prop, info);
    if (prop.required) {
      required.push(prop.name);
    }
  }
  properties['$schema'] = { type: 'string', description: 'JSON Schema reference' };

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `${SITE_ORIGIN}${SCHEMA_BASE_PATH}/${version}.json`,
    type: 'object',
    title: 'Aspire Configuration',
    description:
      'Aspire CLI unified configuration file (aspire.config.json). Replaces .aspire/settings.json and apphost.run.json.',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
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

/** Generate and save the schema for a version unless a copy already exists. Returns true if saved. */
function syncSchema(version: string): boolean {
  const outFile = schemaFilePath(version);
  if (fs.existsSync(outFile)) {
    return false;
  }

  console.log(`⬇️  Generating the schema for ${version} from ${CLI_PACKAGE_ID} ${version}…`);
  const schema = generateSchema(version, readReleasedConfigInfo(version));

  fs.mkdirSync(SCHEMAS_DIR, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(schema, null, 2) + '\n', 'utf-8');
  console.log(`✅ Saved schema to ${path.relative(FRONTEND_ROOT, outFile)}`);
  return true;
}

/** Accept `13.4.4`, `v13.4.4`, or the `v13.4.4-release` tag form, and require a version that ships the schema. */
function parsePinnedVersion(value: string): string {
  const version = STABLE_RELEASE_TAG.exec(value.startsWith('v') ? value : `v${value}`)?.[1];
  if (!version) {
    throw new Error(
      `Invalid --version "${value}". Use a stable release version such as ${MIN_SCHEMA_VERSION}.`
    );
  }
  if (compareVersions(version, MIN_SCHEMA_VERSION) < 0) {
    throw new Error(
      `--version ${version} is older than ${MIN_SCHEMA_VERSION}, the first release that ships the schema.`
    );
  }
  return version;
}

async function main(): Promise<void> {
  const versionArg = getArgValue('--version');
  const pinnedVersion = versionArg === undefined ? undefined : parsePinnedVersion(versionArg);

  let versions: string[];
  if (pinnedVersion) {
    console.log(`📌 Using pinned version: ${pinnedVersion}`);
    versions = [pinnedVersion];
  } else {
    console.log(`🔍 Fetching stable releases from ${ASPIRE_REPO}…`);
    versions = await fetchStableSchemaVersions();
    console.log(`✅ Found ${versions.length} stable releases that ship the schema`);
  }

  let savedCount = 0;
  for (const version of versions) {
    if (syncSchema(version)) {
      savedCount++;
    }
  }
  if (savedCount === 0) {
    console.log('ℹ️  All schemas already exist; nothing to generate.');
  }

  // Update the index. `latest` is the highest version, so an out-of-band patch
  // for an older minor release never replaces a newer latest version.
  const index = readIndex();
  index.versions = [...new Set([...index.versions, ...versions])].sort(compareVersions);
  index.latest = index.versions[index.versions.length - 1];

  writeIndex(index);
  console.log(`✅ Updated ${path.relative(FRONTEND_ROOT, INDEX_FILE)} — latest: ${index.latest}, versions: [${index.versions.join(', ')}]`);
}

main().catch((error: unknown) => {
  console.error('❌ Error:', getErrorMessage(error));
  process.exit(1);
});
