/**
 * update-go-api.ts — Regenerates Go API reference data.
 *
 * Runs the AtsJsonGenerator tool in Go mode against the aspire sdk dump output.
 * Requires: dotnet SDK and aspire CLI.
 * Set ASPIRE_CLI_PATH to use an installed Aspire CLI that is not on PATH.
 *
 * By default, reads the generated C# package JSON files and generates
 * data for the matching Aspire.Hosting* and CommunityToolkit.Aspire.Hosting*
 * package/version sets, the same sets that update-ts-api.ts generates.
 *
 * Optionally pass an Aspire repo clone path to discover packages from source:
 *   tsx ./scripts/update-go-api.ts /path/to/aspire
 *   ASPIRE_REPO_PATH=../../../aspire tsx ./scripts/update-go-api.ts
 *
 * Usage:
 *   tsx ./scripts/update-go-api.ts                # auto-detect from C# package JSON
 *   tsx ./scripts/update-go-api.ts /path/aspire  # from repo clone
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { GO_MODULES_DIR, normalizeApiDir } from './normalize-generated-api-data';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The generator script serves both languages; -Language selects the output.
const SCRIPT_PATH = resolve(
  __dirname,
  '..',
  '..',
  'tools',
  'AtsJsonGenerator',
  'generate-ts-api-json.ps1'
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

function main(): void {
  const aspireRepoPath = process.argv[2] ?? process.env.ASPIRE_REPO_PATH;
  const aspireCliPath = process.env.ASPIRE_CLI_PATH?.trim() || 'aspire';

  if (!checkPrerequisite('dotnet', ['--version'], 'dotnet SDK')) {
    process.exit(1);
  }
  if (!checkPrerequisite(aspireCliPath, ['--version'], 'Aspire CLI')) {
    process.exit(1);
  }

  const psArgs = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    SCRIPT_PATH,
    '-Language',
    'go',
  ];
  if (aspireRepoPath) {
    const resolvedPath = resolve(aspireRepoPath);
    if (!existsSync(resolvedPath)) {
      console.error(`❌ Aspire repo not found at: ${resolvedPath}`);
      process.exit(1);
    }
    console.log(`🔄 Generating Go API reference data from ${resolvedPath}...`);
    psArgs.push('-AspireRepoPath', resolvedPath);
  } else {
    console.log('🔄 Generating Go API reference data from installed Aspire CLI...');
  }

  const outputDir = process.env.ASPIRE_API_GO_MODULES_DIR
    ? resolve(process.env.ASPIRE_API_GO_MODULES_DIR)
    : GO_MODULES_DIR;
  if (process.env.ASPIRE_API_GO_MODULES_DIR) {
    psArgs.push('-OutputDir', outputDir);
  }

  try {
    execFileSync('pwsh', psArgs, { stdio: 'inherit', cwd: resolve(__dirname, '..') });
    console.log('✅ Go API reference data updated.');
  } catch (error: unknown) {
    console.error('❌ Generation failed:', getErrorMessage(error));
    process.exit(1);
  }

  // The generated JSON copies upstream XML documentation verbatim, so enforce
  // Aspire terminology before it is committed (see normalize-generated-api-data.ts).
  console.log('🔄 Normalizing Aspire terminology in go-modules JSON...');
  const { changes } = normalizeApiDir(outputDir);
  console.log(`✅ Normalized ${changes} occurrence(s) in go-modules JSON.`);
}

main();
