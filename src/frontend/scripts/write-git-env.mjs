#!/usr/bin/env node
/**
 * Writes the git commit and repo URL into a .env.local file so Astro (Vite) exposes them.
 * PUBLIC_ prefix ensures they are available in client code.
 */
import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function tryExec(cmd) {
  try {
    return execSync(cmd).toString().trim();
  } catch {
    return null;
  }
}

function getCommit() {
  /**
   * We need to get the commit hash from the public repo's main branch.
   * In CI/CD, there may be other intermediary commits from the deploy branch.
   * This ensures we always get the correct commit hash.
   * Try origin/main first, then fall back to upstream/main for fork workflows.
   */
  return (
    tryExec('git merge-base origin/main HEAD') ??
    tryExec('git merge-base upstream/main HEAD') ??
    ''
  );
}

function getRepoUrl() {
  try {
    const pkgPath = join(__dirname, '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.repository) {
      if (typeof pkg.repository === 'string')
        return pkg.repository.replace(/^git\+/, '').replace(/\.git$/, '');
      if (typeof pkg.repository === 'object' && pkg.repository.url)
        return pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
    }
  } catch {}
  return 'https://github.com/microsoft/aspire.dev';
}

const commit = getCommit();
const repo = getRepoUrl().replace(/\/$/, '');

const lines = [`PUBLIC_GIT_COMMIT_ID=${commit}`, `PUBLIC_REPO_URL=${repo}`];

const envPath = join(process.cwd(), '.env.local');
let updated = false;
let content = '';
if (existsSync(envPath)) {
  content = readFileSync(envPath, 'utf8');
  lines.forEach((line) => {
    const [key] = line.split('=');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, line);
      updated = true;
    } else {
      content += (content.endsWith('\n') ? '' : '\n') + line + '\n';
      updated = true;
    }
  });
  writeFileSync(envPath, content);
} else {
  writeFileSync(envPath, lines.join('\n') + '\n');
  updated = true;
}

if (process.env.CI) {
  console.log(lines.join('\n'));
}

console.log(`git env ${updated ? 'updated' : 'unchanged'}: commit=${commit} repo=${repo}`);
