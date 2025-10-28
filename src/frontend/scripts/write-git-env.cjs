#!/usr/bin/env node
/**
 * Writes current git commit and repo URL into a .env.local file so Astro (Vite) exposes them.
 * PUBLIC_ prefix ensures they are available in client code.
 */
const { execSync } = require('child_process');
const { writeFileSync, existsSync } = require('fs');
const { join } = require('path');

function getCommit() {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return '';
  }
}

function getRepoUrl() {
  try {
    const pkg = require('../package.json');
    if (pkg.repository) {
      if (typeof pkg.repository === 'string') return pkg.repository.replace(/^git\+/, '').replace(/\.git$/, '');
      if (pkg.repository.url) return pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
    }
  } catch { }
  return 'https://github.com/microsoft/aspire.dev';
}

const commit = getCommit();
const repo = getRepoUrl().replace(/\/$/, '');

const lines = [
  `PUBLIC_GIT_COMMIT_ID=${commit}`,
  `PUBLIC_REPO_URL=${repo}`,
];

const envPath = join(process.cwd(), '.env.local');
let updated = false;
let content = '';
if (existsSync(envPath)) {
  content = require('fs').readFileSync(envPath, 'utf8');
  lines.forEach(line => {
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
