import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const allowed = new Set(['--force', '--skip-search']);
for (const arg of args) {
  if (!allowed.has(arg)) throw new Error(`Unknown incremental build option: ${arg}`);
}
const mode = args.includes('--skip-search') ? 'skip-search' : 'production';
const result = spawnSync(
  process.execPath,
  [
    join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'),
    'build',
    '--mode',
    mode,
    ...(args.includes('--force') ? ['--force'] : []),
  ],
  {
    cwd: root,
    env: { ...process.env, ASPIRE_INCREMENTAL_BUILD: '1' },
    stdio: 'inherit',
  }
);
if (result.error) throw result.error;
if (result.signal) throw new Error(`Incremental build terminated by ${result.signal}.`);
process.exitCode = result.status ?? 1;
