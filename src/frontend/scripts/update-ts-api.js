/**
 * update-ts-api.js — Regenerates TypeScript API reference data.
 *
 * Runs the AtsJsonGenerator tool against the aspire sdk dump output.
 * Requires: dotnet SDK, aspire CLI, and a local dotnet/aspire repo clone.
 *
 * Set the ASPIRE_REPO_PATH environment variable to point to your clone,
 * or pass it as the first CLI argument.
 *
 * Usage:
 *   ASPIRE_REPO_PATH=../../../aspire node ./scripts/update-ts-api.js
 *   node ./scripts/update-ts-api.js /path/to/aspire
 */

import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '..', '..', 'tools', 'AtsJsonGenerator', 'generate-ts-api-json.ps1');

function checkPrerequisite(cmd, args, name) {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch {
    console.error(`❌ ${name} not found. Please install it first.`);
    return false;
  }
}

function main() {
  const aspireRepoPath = process.argv[2] || process.env.ASPIRE_REPO_PATH;

  if (!aspireRepoPath) {
    console.error('Usage: node ./scripts/update-ts-api.js <aspire-repo-path>');
    console.error('   or: ASPIRE_REPO_PATH=<path> node ./scripts/update-ts-api.js');
    process.exit(1);
  }

  const resolvedPath = resolve(aspireRepoPath);
  if (!existsSync(resolvedPath)) {
    console.error(`❌ Aspire repo not found at: ${resolvedPath}`);
    process.exit(1);
  }

  // Check prerequisites
  if (!checkPrerequisite('dotnet', ['--version'], 'dotnet SDK')) process.exit(1);
  if (!checkPrerequisite('aspire', ['--version'], 'Aspire CLI')) process.exit(1);

  console.log(`🔄 Generating TypeScript API reference data from ${resolvedPath}...`);

  try {
    execSync(
      `pwsh -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}" -AspireRepoPath "${resolvedPath}"`,
      { stdio: 'inherit', cwd: resolve(__dirname, '..') },
    );
    console.log('✅ TypeScript API reference data updated.');
  } catch (err) {
    console.error('❌ Generation failed:', err.message);
    process.exit(1);
  }
}

main();
