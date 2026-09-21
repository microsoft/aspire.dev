import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAXParser } from 'parse5-sax-parser';

// Match the 40-byte commit width so replacements never shift cached offsets.
export const commitPlaceholder = 'ASPRSHA_INCREMENTAL_BUILD_IDENTITY_TOKEN';
const shortCommitPlaceholder = commitPlaceholder.slice(0, 7);
const commitPlaceholderBytes = Buffer.from(commitPlaceholder);
const shortCommitPlaceholderBytes = Buffer.from(shortCommitPlaceholder);
const cacheEpoch = 'api-v1';

/**
 * @param {import('astro').AstroPrerenderer} prerenderer
 * @returns {import('astro').AstroPrerenderer}
 */
export function scopeIncrementalMetadata(prerenderer) {
  /** @type {Set<string>} */
  const cacheableComponents = new Set();
  let trackedPages = 0;
  let bypassedPages = 0;
  return {
    ...prerenderer,
    name: `${prerenderer.name}:cacheable-metadata`,
    setup: prerenderer.setup?.bind(prerenderer),
    collectStaticImages: prerenderer.collectStaticImages?.bind(prerenderer),
    async getStaticPaths() {
      const paths = await prerenderer.getStaticPaths();
      cacheableComponents.clear();
      for (const { route, cacheKey } of paths) {
        if (cacheKey !== undefined) cacheableComponents.add(route.component);
      }
      return paths;
    },
    render(request, options) {
      // Astro otherwise collects metadata even for components that never cache.
      const collectMetadata =
        options.collectMetadata && cacheableComponents.has(options.routeData.component);
      if (options.collectMetadata) {
        if (collectMetadata) trackedPages++;
        else bypassedPages++;
      }
      return prerenderer.render(request, { ...options, collectMetadata });
    },
    async teardown() {
      await prerenderer.teardown?.();
      console.log(
        `[incremental-build] prerender metadata ${JSON.stringify({ trackedPages, bypassedPages })}`
      );
    },
  };
}

/** @typedef {{ start: number, end: number }} IdentityRange */
/** @typedef {Map<string, IdentityRange[]>} IdentityRangeCache */

/**
 * @param {unknown} value
 * @returns {value is IdentityRange[]}
 */
function isIdentityRanges(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (range) =>
        range &&
        typeof range === 'object' &&
        Number.isSafeInteger(range.start) &&
        Number.isSafeInteger(range.end) &&
        range.start >= 0 &&
        [commitPlaceholderBytes.length, shortCommitPlaceholderBytes.length].includes(
          range.end - range.start
        )
    )
  );
}

/**
 * @param {URL} path
 * @returns {Promise<IdentityRangeCache>}
 */
async function readIdentityRangeCache(path) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return new Map();
    if (!(error instanceof SyntaxError)) throw error;
    console.warn('[incremental-build] Invalid identity range cache JSON; reparsing HTML.');
    return new Map();
  }
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !Object.entries(data).every(
      ([digest, ranges]) => /^[a-f\d]{64}$/.test(digest) && isIdentityRanges(ranges)
    )
  ) {
    console.warn('[incremental-build] Invalid identity range cache entries; reparsing HTML.');
    return new Map();
  }
  return new Map(Object.entries(data));
}

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
      .filter((name) => name === '.npmrc' || /\.(?:[cm]?js|ts|json|ya?ml)$/.test(name))
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
 * @param {IdentityRangeCache} [rangeCache]
 */
export function stampBuildIdentity(html, commit, rangeCache) {
  const bytes = Buffer.from(html, 'utf8');
  return stampBuildIdentityBytes(bytes, commit, rangeCache) ? bytes.toString('utf8') : html;
}

/**
 * @param {Buffer} html
 * @param {string} commit
 * @param {IdentityRangeCache} [rangeCache]
 */
export function stampBuildIdentityBytes(html, commit, rangeCache) {
  if (!/^[a-f\d]{40}$/i.test(commit)) {
    throw new Error('Incremental builds require a full git commit identity.');
  }
  if (!html.includes(shortCommitPlaceholderBytes)) return false;
  const digest = rangeCache ? createHash('sha256').update(html).digest('hex') : undefined;
  const cachedRanges = digest ? rangeCache.get(digest) : undefined;
  if (cachedRanges?.some(({ end }) => end > html.length)) {
    throw new Error('Identity range cache exceeds its source HTML; rebuild with --force.');
  }
  /** @type {IdentityRange[]} */
  let ranges = cachedRanges ?? [];
  if (!cachedRanges) {
    const source = html.toString('utf8');
    /** @type {Array<number | undefined>} */
    const anchors = [];
    const parser = new SAXParser({ sourceCodeLocationInfo: true });
    parser.on('startTag', ({ tagName, attrs, sourceCodeLocation }) => {
      if (
        tagName === 'meta' &&
        attrs.some(
          ({ name, value }) =>
            name === 'name' && ['git-commit-id', 'git-source-url'].includes(value)
        )
      ) {
        ranges.push({ start: sourceCodeLocation.startOffset, end: sourceCodeLocation.endOffset });
      } else if (tagName === 'a') {
        const selected = attrs.some(
          ({ name, value }) => name === 'class' && value.split(/\s+/).includes('commit-link')
        );
        anchors.push(selected ? sourceCodeLocation.startOffset : undefined);
      }
    });
    parser.on('endTag', ({ tagName, sourceCodeLocation }) => {
      if (tagName !== 'a') return;
      const start = anchors.pop();
      if (start !== undefined) ranges.push({ start, end: sourceCodeLocation.endOffset });
    });
    parser.end(source);
    ranges = ranges.map(({ start, end }) => {
      const byteStart = Buffer.byteLength(source.slice(0, start));
      return { start: byteStart, end: byteStart + Buffer.byteLength(source.slice(start, end)) };
    });
    /** @type {IdentityRange[]} */
    const tokens = [];
    let start = html.indexOf(shortCommitPlaceholderBytes);
    while (start !== -1) {
      const full = html
        .subarray(start, start + commitPlaceholderBytes.length)
        .equals(commitPlaceholderBytes);
      const end =
        start + (full ? commitPlaceholderBytes.length : shortCommitPlaceholderBytes.length);
      if (!ranges.some((range) => range.start <= start && end <= range.end)) {
        throw new Error(
          'Unstamped build identity outside the supported metadata/footer locations.'
        );
      }
      tokens.push({ start, end });
      start = html.indexOf(shortCommitPlaceholderBytes, end);
    }
    ranges = tokens;
  }
  const commitBytes = Buffer.from(commit);
  for (const { start, end } of ranges) {
    const token = html.subarray(start, end);
    const full = end - start === commitPlaceholderBytes.length;
    if (
      !token.equals(full ? commitPlaceholderBytes : shortCommitPlaceholderBytes) ||
      (!full &&
        html.subarray(start, start + commitPlaceholderBytes.length).equals(commitPlaceholderBytes))
    ) {
      throw new Error('Invalid identity range cache token; rebuild with --force.');
    }
    commitBytes.copy(html, start, 0, end - start);
  }
  if (html.includes(shortCommitPlaceholderBytes)) {
    throw new Error('Unstamped build identity outside the supported metadata/footer locations.');
  }
  if (digest && !cachedRanges) rangeCache.set(digest, ranges);
  return true;
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

/** @param {{root: URL, mode: string, env: Record<string, string>, force?: boolean}} options */
export function incrementalBuildSettings({ root, mode, env, force = false }) {
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
  const cacheDir = new URL(`node_modules/.astro-incremental/${mode}/${compatibility}/`, root);
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
    cacheDir,
    define: {
      'import.meta.env.PUBLIC_GIT_COMMIT_ID': JSON.stringify(
        env.PUBLIC_GIT_COMMIT_ID ? commitPlaceholder : ''
      ),
      'import.meta.env.GIT_COMMIT_ID': JSON.stringify(env.GIT_COMMIT_ID ? commitPlaceholder : ''),
    },
    integration: {
      name: 'aspire-incremental-build-identity',
      hooks: {
        'astro:build:start': ({ setPrerenderer }) => {
          setPrerenderer(scopeIncrementalMetadata);
        },
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
        // Astro has stored reusable raw output by this point; Pagefind has not indexed it yet.
        'astro:build:generated': async ({ dir }) => {
          const started = performance.now();
          const rangePath = new URL('identity-ranges.json', cacheDir);
          const rangeCache = force ? new Map() : await readIdentityRangeCache(rangePath);
          let stamped = 0;
          let parsed = 0;
          let reused = 0;
          const pending = files(fileURLToPath(dir));
          async function stampFiles() {
            for (const path of pending) {
              if (!path.endsWith('.html')) continue;
              const html = await readFile(path);
              const entries = rangeCache.size;
              if (stampBuildIdentityBytes(html, commit, rangeCache)) {
                if (rangeCache.size === entries) reused++;
                else parsed++;
                await writeFile(path, html);
                stamped++;
              }
            }
          }
          const results = await Promise.allSettled(Array.from({ length: 4 }, () => stampFiles()));
          for (const result of results) {
            if (result.status === 'rejected') throw result.reason;
          }
          await mkdir(cacheDir, { recursive: true });
          const temporary = new URL(`identity-ranges.${process.pid}.tmp`, cacheDir);
          await writeFile(temporary, JSON.stringify(Object.fromEntries(rangeCache)));
          await rename(temporary, rangePath);
          console.log(
            `[incremental-build] finalized identity ${JSON.stringify({
              htmlFiles: stamped,
              parsedPages: parsed,
              reusedPages: reused,
              wallMs: performance.now() - started,
            })}`
          );
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
    force: process.argv.includes('--force'),
  });
}
