import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, ASPIRE_HYBRID_API_DOCS: '1' };
execFileSync('pnpm', [process.argv.includes('--skip-search') ? 'build:skip-search' : 'build'], {
  cwd, env, stdio: 'inherit', shell: process.platform === 'win32',
});
