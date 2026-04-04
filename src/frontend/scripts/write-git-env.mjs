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
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
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
    tryExec('git merge-base origin/main HEAD') ?? tryExec('git merge-base upstream/main HEAD') ?? ''
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
const fileExists = existsSync(envPath);
const existingContent = fileExists ? readFileSync(envPath, 'utf8') : '';

let content = fileExists ? existingContent : lines.join('\n') + '\n';

if (fileExists) {
  lines.forEach((line) => {
    const [key] = line.split('=');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += (content.endsWith('\n') ? '' : '\n') + line + '\n';
    }
  });
}

const updated = content !== existingContent;

if (updated) {
  writeFileSync(envPath, content);
}

if (process.env.CI) {
  console.log(lines.join('\n'));
}

console.log(`git env ${updated ? 'updated' : 'unchanged'}: commit=${commit} repo=${repo}`);
