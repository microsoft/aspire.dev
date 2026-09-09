/**
 * update-ts-api.ts — Regenerates config-driven AppHost API reference data.
 *
 * Runs the AtsJsonGenerator tool against the aspire sdk dump output.
 * Requires: dotnet SDK and aspire CLI.
 * Set ASPIRE_CLI_PATH to use an installed Aspire CLI that is not on PATH.
 *
 * By default, reads the generated C# package JSON files and generates
 * one semantic document for each matching Aspire.Hosting* and
 * CommunityToolkit.Aspire.Hosting* package/version set.
 *
 * Optionally pass an Aspire repo clone path to discover packages from source:
 *   tsx ./scripts/update-ts-api.ts /path/to/aspire
 *   ASPIRE_REPO_PATH=../../../aspire tsx ./scripts/update-ts-api.ts
 *
 * Usage:
 *   tsx ./scripts/update-ts-api.ts                # auto-detect from C# package JSON
 *   tsx ./scripts/update-ts-api.ts /path/aspire  # from repo clone
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  APPHOST_LANGUAGE_SUPPORT_FILE,
  APPHOST_MODULES_DIR,
  normalizeApiDir,
  normalizeApiFile,
} from './normalize-generated-api-data';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(
  __dirname,
  '..',
  '..',
  'tools',
  'AtsJsonGenerator',
  'generate-apphost-api-json.ps1'
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function checkPrerequisite(cmd: string, args: string[], name: string): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch {
    console.error(`❌ ${name} not found. Please install it first.`);
    return false;
  }
}

function readCommandOutput(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function main(): void {
  const aspireRepoPath = process.argv[2] ?? process.env.ASPIRE_REPO_PATH;
  const aspireCliPath = process.env.ASPIRE_CLI_PATH?.trim() || 'aspire';

  if (!checkPrerequisite('dotnet', ['--version'], 'dotnet SDK')) {
    process.exit(1);
  }
  if (!checkPrerequisite(aspireCliPath, ['--version'], 'Aspire CLI')) {
    process.exit(1);
  }
  const aspireCliVersion = readCommandOutput(aspireCliPath, ['--version']);

  const psArgs = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    SCRIPT_PATH,
    '-DumpCliVersion',
    aspireCliVersion,
  ];
  if (aspireRepoPath) {
    const resolvedPath = resolve(aspireRepoPath);
    if (!existsSync(resolvedPath)) {
      console.error(`❌ Aspire repo not found at: ${resolvedPath}`);
      process.exit(1);
    }
    console.log(`🔄 Generating AppHost API reference data from ${resolvedPath}...`);
    psArgs.push('-AspireRepoPath', resolvedPath);
  } else {
    console.log('🔄 Generating AppHost API reference data from installed Aspire CLI...');
  }

  const outputDir = process.env.ASPIRE_API_APPHOST_MODULES_DIR
    ? resolve(process.env.ASPIRE_API_APPHOST_MODULES_DIR)
    : process.env.ASPIRE_API_TS_MODULES_DIR
      ? resolve(process.env.ASPIRE_API_TS_MODULES_DIR)
      : APPHOST_MODULES_DIR;
  if (process.env.ASPIRE_API_APPHOST_MODULES_DIR || process.env.ASPIRE_API_TS_MODULES_DIR) {
    psArgs.push('-OutputDir', outputDir);
  }

  try {
    execFileSync('pwsh', psArgs, { stdio: 'inherit', cwd: resolve(__dirname, '..') });
    console.log('✅ AppHost API reference data updated.');
  } catch (error: unknown) {
    console.error('❌ Generation failed:', getErrorMessage(error));
    process.exit(1);
  }

  // Enforce Aspire terminology in the freshly generated apphost-modules JSON before
  // the twoslash bundle is derived from it, so both the JSON and the .d.ts hover
  // tooltips stay free of the deprecated Aspire terminology that upstream
  // JSDoc/XML docs may carry. Reuses the single source of truth in
  // aspire-terminology.ts.
  console.log('🔄 Normalizing Aspire terminology in apphost-modules JSON...');
  const { changes: tsModuleChanges } = normalizeApiDir(outputDir);
  console.log(`✅ Normalized ${tsModuleChanges} occurrence(s) in apphost-modules JSON.`);
  const supportFile = process.env.ASPIRE_API_LANGUAGE_SUPPORT_FILE
    ? resolve(process.env.ASPIRE_API_LANGUAGE_SUPPORT_FILE)
    : APPHOST_LANGUAGE_SUPPORT_FILE;
  if (existsSync(supportFile)) {
    const supportChanges = normalizeApiFile(supportFile);
    console.log(`✅ Normalized ${supportChanges} occurrence(s) in the AppHost support matrix.`);
  }

  // Refresh the twoslash .d.ts bundle so docs hover tooltips stay in sync
  // with the TypeScript projection. The bundle is source-controlled
  // at src/data/twoslash/aspire.d.ts — commit the diff alongside the JSON.
  const generatorScript = resolve(__dirname, 'generate-twoslash-types.ts');
  const tsxBin = resolve(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  console.log('🔄 Regenerating twoslash .d.ts bundle...');
  try {
    execFileSync(process.execPath, [tsxBin, generatorScript], {
      stdio: 'inherit',
      cwd: resolve(__dirname, '..'),
    });
    console.log('✅ Twoslash types refreshed (src/data/twoslash/aspire.d.ts).');
  } catch (error: unknown) {
    console.error('❌ Twoslash type generation failed:', getErrorMessage(error));
    process.exit(1);
  }
}

main();
