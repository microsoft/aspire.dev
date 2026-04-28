#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, '..');
const staticHostWwwroot = resolve(frontendDir, '..', 'statichost', 'StaticHost', 'wwwroot');
const tempDir = mkdtempSync(join(tmpdir(), 'aspire-statichost-wwwroot-'));
const skipSearch = process.argv.includes('--skip-search');

const gitignoreContents = `# Ignore local copies of src/frontend/dist used for StaticHost smoke testing.
*
!.gitignore
!index.html
!scalar/
!scalar/**
`;

function preserve(path, name) {
  if (!existsSync(path)) return;
  cpSync(path, join(tempDir, name), { recursive: true });
}

function restore(path, name) {
  const preserved = join(tempDir, name);
  if (!existsSync(preserved)) return;
  cpSync(preserved, path, { recursive: true });
}

function run(command, env = process.env) {
  execSync(command, {
    cwd: frontendDir,
    env,
    stdio: 'inherit',
  });
}

try {
  preserve(join(staticHostWwwroot, 'scalar'), 'scalar');
  preserve(join(staticHostWwwroot, '.gitignore'), '.gitignore');

  run('pnpm git-env');
  run(
    `pnpm exec astro build${skipSearch ? ' --mode skip-search' : ''}`,
    {
      ...process.env,
      ASTRO_OUT_DIR: staticHostWwwroot,
    },
  );

  restore(join(staticHostWwwroot, 'scalar'), 'scalar');
  const gitignorePath = join(staticHostWwwroot, '.gitignore');
  restore(gitignorePath, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, gitignoreContents);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
