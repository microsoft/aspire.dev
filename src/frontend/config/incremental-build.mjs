import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectAll } from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';

export const commitPlaceholder = 'ASPRSHA_BUILD_IDENTITY_NOT_FOR_DEPLOYMENT';
const shortCommitPlaceholder = commitPlaceholder.slice(0, 7);
const cacheEpoch = 'api-v1';

/** @param {string} directory */
function* files(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name, 'en')
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

/**
 * @param {string} root
 * @param {string} mode
 * @param {Record<string, string>} publicEnv
 */
export function incrementalCompatibility(root, mode, publicEnv) {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      epoch: cacheEpoch,
      mode,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      outDir: process.env.ASTRO_OUT_DIR || 'dist',
      publicEnv: Object.fromEntries(
        Object.entries(publicEnv)
          .filter(([key]) => key !== 'PUBLIC_GIT_COMMIT_ID')
          .sort(([a], [b]) => a.localeCompare(b, 'en'))
      ),
    })
  );
  const inputs = [
    ...readdirSync(root)
      .filter((name) => /\.(?:[cm]?js|ts|json|ya?ml)$/.test(name))
      .map((name) => join(root, name)),
    ...files(join(root, 'config')),
    ...files(join(root, 'patches')),
    ...files(join(root, 'src')),
    ...files(join(root, 'public')),
  ];
  for (const path of inputs.sort()) {
    const name = relative(root, path).replaceAll('\\', '/');
    // Only package data is independently keyed. MDX can change global virtual
    // CSS and imported assets, so documentation edits conservatively evict APIs.
    if (/^src\/data\/(?:pkgs|ts-modules)\//.test(name)) continue;
    hash.update(name);
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return `${cacheEpoch}-${hash.digest('hex')}`;
}

/** @param {string} root */
export function generatedIconDigest(root) {
  const hash = createHash('sha256');
  for (const path of files(join(root, '.starlight-icons'))) {
    hash.update(relative(root, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * @param {string} html
 * @param {string} commit
 */
export function stampBuildIdentity(html, commit) {
  if (!/^[a-f\d]{40}$/i.test(commit)) {
    throw new Error('Incremental builds require a full git commit identity.');
  }
  const tree = unified().use(rehypeParse).parse(html);
  const nodes = selectAll(
    'meta[name="git-commit-id"], meta[name="git-source-url"], a.commit-link',
    tree
  );
  for (const node of nodes.toReversed()) {
    const { start, end } = node.position;
    const markup = html
      .slice(start.offset, end.offset)
      .replaceAll(commitPlaceholder, commit)
      .replaceAll(shortCommitPlaceholder, commit.slice(0, 7));
    html = html.slice(0, start.offset) + markup + html.slice(end.offset);
  }
  if (html.includes(shortCommitPlaceholder)) {
    throw new Error('Unstamped build identity outside the supported metadata/footer locations.');
  }
  return html;
}

/**
 * @param {string} source
 * @param {string} id
 * @param {boolean} hasCommit
 */
export function replacePrivateBuildIdentity(source, id, hasCommit) {
  const consumer = /\/src\/components\/(?:starlight\/(?:Head|Footer)|MicrosoftFooter)\.astro$/;
  if (!consumer.test(id.replaceAll('\\', '/'))) return undefined;
  const reference = 'import.meta.env.GIT_COMMIT_ID';
  if (!source.includes(reference)) return undefined;
  return {
    code: source.replaceAll(reference, JSON.stringify(hasCommit ? commitPlaceholder : '')),
    map: null,
  };
}

/** @param {{root: URL, mode: string, env: Record<string, string>}} options */
export function incrementalBuildSettings({ root, mode, env }) {
  if (!['production', 'skip-search'].includes(mode)) {
    throw new Error(`Unsupported incremental build mode: ${mode}`);
  }
  const commit = env.PUBLIC_GIT_COMMIT_ID || env.GIT_COMMIT_ID || '';
  if (!/^[a-f\d]{40}$/i.test(commit)) {
    throw new Error(
      'Run the git-env script before an incremental build; commit identity is missing.'
    );
  }
  const directory = fileURLToPath(root);
  const publicEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => key.startsWith('PUBLIC_') || key === 'REPO_URL')
  );
  const compatibility = incrementalCompatibility(directory, mode, publicEnv);
  /** @type {import('vite').Plugin} */
  const privateIdentityPlugin = {
    name: 'aspire-incremental-private-identity',
    enforce: 'pre',
    transform: {
      // Astro substitutes private env values before vite:define runs.
      order: 'pre',
      handler(source, id) {
        return replacePrivateBuildIdentity(source, id, Boolean(env.GIT_COMMIT_ID));
      },
    },
  };
  return {
    compatibility,
    privateIdentityPlugin,
    cacheDir: new URL(`node_modules/.astro-incremental/${mode}/${compatibility}/`, root),
    define: {
      'import.meta.env.PUBLIC_GIT_COMMIT_ID': JSON.stringify(
        env.PUBLIC_GIT_COMMIT_ID ? commitPlaceholder : ''
      ),
      'import.meta.env.GIT_COMMIT_ID': JSON.stringify(env.GIT_COMMIT_ID ? commitPlaceholder : ''),
    },
    integration: {
      name: 'aspire-incremental-build-identity',
      hooks: {
        'astro:config:setup': ({ updateConfig }) => {
          // Icons refresh during Starlight setup, after the outer config was
          // evaluated. Capture that generated input only after its hook ran.
          updateConfig({
            vite: {
              define: {
                'import.meta.env.ASPIRE_INCREMENTAL_ICON_DIGEST': JSON.stringify(
                  generatedIconDigest(directory)
                ),
              },
            },
          });
        },
        'astro:build:done': async ({ dir }) => {
          let stamped = 0;
          for (const path of files(fileURLToPath(dir))) {
            if (!path.endsWith('.html')) continue;
            const html = await readFile(path, 'utf8');
            if (!html.includes(commitPlaceholder) && !html.includes(shortCommitPlaceholder))
              continue;
            const updated = stampBuildIdentity(html, commit);
            if (html !== updated) {
              await writeFile(path, updated);
              stamped++;
            }
          }
          console.log(`[incremental-build] finalized identity on ${stamped} HTML files`);
        },
      },
    },
  };
}

/**
 * @param {URL} root
 * @param {string} mode
 */
export async function loadIncrementalBuildSettings(root, mode) {
  const { loadEnv } = await import('vite');
  return incrementalBuildSettings({
    root,
    mode,
    env: loadEnv(mode, fileURLToPath(root), ['PUBLIC_', 'GIT_COMMIT_ID', 'REPO_URL']),
  });
}
