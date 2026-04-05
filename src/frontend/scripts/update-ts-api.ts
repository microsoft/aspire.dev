/**
 * update-ts-api.ts — Regenerates TypeScript API reference data.
 *
 * Runs the AtsJsonGenerator tool against the aspire sdk dump output.
 * Requires: dotnet SDK and aspire CLI.
 *
 * By default, reads the generated C# package JSON files and generates
 * data for the matching Aspire.Hosting.* package/version set.
 *
 * Optionally pass an Aspire repo clone path to discover packages from source:
 *   tsx ./scripts/update-ts-api.ts /path/to/aspire
 *   ASPIRE_REPO_PATH=../../../aspire tsx ./scripts/update-ts-api.ts
 *
 * Usage:
 *   tsx ./scripts/update-ts-api.ts                # auto-detect from C# package JSON
 *   tsx ./scripts/update-ts-api.ts /path/aspire  # from repo clone
 */

import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

  if (!checkPrerequisite('dotnet', ['--version'], 'dotnet SDK')) {
    process.exit(1);
  }
  if (!checkPrerequisite('aspire', ['--version'], 'Aspire CLI')) {
    process.exit(1);
  }

  let psArgs: string;
  if (aspireRepoPath) {
    const resolvedPath = resolve(aspireRepoPath);
    if (!existsSync(resolvedPath)) {
      console.error(`❌ Aspire repo not found at: ${resolvedPath}`);
      process.exit(1);
    }
    console.log(`🔄 Generating TypeScript API reference data from ${resolvedPath}...`);
    psArgs = `-AspireRepoPath "${resolvedPath}"`;
  } else {
    console.log('🔄 Generating TypeScript API reference data from installed Aspire CLI...');
    psArgs = '';
  }

  try {
    execSync(
      `pwsh -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}" ${psArgs}`.trim(),
      { stdio: 'inherit', cwd: resolve(__dirname, '..') }
    );
    console.log('✅ TypeScript API reference data updated.');
  } catch (error: unknown) {
    console.error('❌ Generation failed:', getErrorMessage(error));
    process.exit(1);
  }
}

main();