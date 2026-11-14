#!/usr/bin/env node
// Writes data/build.json, the build's identity, which templates read as `build` (site data is keyed by file name):
//
//   { "commit": "<full SHA>", "repo": "https://github.com/microsoft/aspire.dev", "date": "<commit date, ISO 8601>" }
//
// - partials/head.liquid: <meta name="git-commit-id"> (empty when the commit is unknown) and <meta name="git-source-url">;
// - partials/footer.liquid: the "SHA <short>" link to the commit.
//
// Run it before the Douze build, from src/site (the build steps run it first, like icons-sprite.mjs, build-client.mjs
// and build-css.mjs):
//
//   node scripts/write-build-info.mjs [--out data/build.json]
//
// The commit is `git rev-parse HEAD`, unless PUBLIC_GIT_COMMIT_ID or GIT_COMMIT_ID is set (the variables the Astro build
// read); the repository is PUBLIC_REPO_URL or REPO_URL, else https://github.com/microsoft/aspire.dev. The date is the
// commit's date rather than the time of the build, so the file only changes with the commit (deterministic builds,
// and the cache keeps the pages that read it). Outside a git checkout, without the variables, commit and date are
// empty strings and the pages render without a commit. The file is only rewritten when its content changes.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const outFile = path.resolve(outIndex > 0 ? process.argv[outIndex + 1] : path.join(siteRoot, 'data/build.json'));

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: siteRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const commit = (process.env.PUBLIC_GIT_COMMIT_ID || process.env.GIT_COMMIT_ID || git('rev-parse', 'HEAD')).trim();
const repo = (process.env.PUBLIC_REPO_URL || process.env.REPO_URL || 'https://github.com/microsoft/aspire.dev')
  .trim()
  .replace(/\/$/, '');
const date = commit ? git('log', '-1', '--format=%cI', commit) : '';

const content = `${JSON.stringify({ commit, repo, date }, null, 2)}\n`;
const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
if (current !== content) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, content);
}
console.log(`write-build-info: ${path.relative(process.cwd(), outFile) || outFile} (commit ${commit.slice(0, 7) || 'unknown'})`);
