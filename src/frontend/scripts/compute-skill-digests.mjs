// @ts-check
/**
 * compute-skill-digests.mjs
 *
 * Recomputes `digest` fields in `public/.well-known/agent-skills/index.json` by
 * sha256-hashing each referenced skill artifact's raw bytes. Run as a `prebuild`
 * step so the published index.json always matches the served SKILL.md bytes.
 *
 * Usage:
 *   node scripts/compute-skill-digests.mjs           # update digests in place
 *   node scripts/compute-skill-digests.mjs --check   # exit non-zero if stale
 *
 * The tool deliberately reads files as raw bytes (no LF/CRLF normalization)
 * — `.gitattributes` pins LF for these paths so the on-disk bytes are stable
 * across Windows and Linux checkouts.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const publicRoot = path.join(repoRoot, 'public');
const indexPath = path.join(publicRoot, '.well-known', 'agent-skills', 'index.json');

const checkOnly = process.argv.includes('--check');

/**
 * @param {string} filePath
 * @returns {Promise<string>} sha256 hash as `sha256:<lowerhex>`
 */
async function digestFile(filePath) {
  const bytes = await readFile(filePath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Resolve a public URL like `/.well-known/foo/bar.md` to its on-disk path.
 * @param {string} url
 */
function resolvePublicPath(url) {
  if (!url.startsWith('/')) {
    throw new Error(`Skill url must be absolute: ${url}`);
  }
  return path.join(publicRoot, url.slice(1));
}

const raw = await readFile(indexPath, 'utf8');
const original = raw;
/** @type {{ skills: Array<{ name: string; type: string; url: string; digest?: string }> }} */
const index = JSON.parse(raw);

if (!Array.isArray(index.skills)) {
  throw new Error('index.json must contain a `skills` array');
}

let changed = false;
for (const skill of index.skills) {
  if (skill.type !== 'skill-md') {
    // Future skill types might use a different bytes-to-digest convention;
    // bail loudly so we don't silently emit a wrong digest.
    throw new Error(`Unsupported skill type "${skill.type}" for ${skill.name}`);
  }
  const filePath = resolvePublicPath(skill.url);
  const fresh = await digestFile(filePath);
  if (skill.digest !== fresh) {
    changed = true;
    if (!checkOnly) {
      skill.digest = fresh;
    } else {
      console.error(
        `[compute-skill-digests] STALE digest for ${skill.name}: index.json has ${skill.digest}, file is ${fresh}`
      );
    }
  }
}

const next = JSON.stringify(index, null, 2) + '\n';

if (checkOnly) {
  if (changed || next !== original) {
    console.error(
      '[compute-skill-digests] index.json is out of date. Run `node scripts/compute-skill-digests.mjs` to refresh.'
    );
    process.exit(1);
  }
  console.log('[compute-skill-digests] index.json is up to date.');
  process.exit(0);
}

if (next !== original) {
  await writeFile(indexPath, next, 'utf8');
  console.log('[compute-skill-digests] Updated', path.relative(repoRoot, indexPath));
} else {
  console.log('[compute-skill-digests] No changes.');
}
