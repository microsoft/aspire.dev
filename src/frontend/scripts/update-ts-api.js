/**
 * update-ts-api.js — Regenerates TypeScript API reference data.
 *
 * Runs the AtsJsonGenerator tool against the aspire sdk dump output.
 * Requires: dotnet SDK and aspire CLI.
 *
 * By default, auto-detects the installed Aspire CLI version and generates
 * data for all known Aspire.Hosting.* packages from aspire-integrations.json.
 *
 * Optionally pass an Aspire repo clone path to discover packages from source:
 *   node ./scripts/update-ts-api.js /path/to/aspire
 *   ASPIRE_REPO_PATH=../../../aspire node ./scripts/update-ts-api.js
 *
 * Usage:
 *   node ./scripts/update-ts-api.js              # auto-detect from CLI
 *   node ./scripts/update-ts-api.js /path/aspire  # from repo clone
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

  // Check prerequisites
  if (!checkPrerequisite('dotnet', ['--version'], 'dotnet SDK')) process.exit(1);
  if (!checkPrerequisite('aspire', ['--version'], 'Aspire CLI')) process.exit(1);

  let psArgs;
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
      { stdio: 'inherit', cwd: resolve(__dirname, '..') },
    );
    console.log('✅ TypeScript API reference data updated.');
  } catch (err) {
    console.error('❌ Generation failed:', err.message);
    process.exit(1);
  }
}

main();
