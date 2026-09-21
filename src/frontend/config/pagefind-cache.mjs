import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAXParser } from 'parse5-sax-parser';

/** @param {string} directory */
async function* files(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en')
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
    else throw new Error(`Unsupported search-cache file: ${path}`);
  }
}

/** @param {Buffer | string} bytes */
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {string} html */
function hasBodyAttribute(html) {
  let found = false;
  const parser = new SAXParser();
  parser.on('startTag', ({ attrs }) => {
    if (attrs.some(({ name }) => name === 'data-pagefind-body')) found = true;
  });
  parser.end(html);
  return found;
}

/** @param {URL} dir */
export async function pagefindInputKey(dir) {
  const root = fileURLToPath(dir);
  const entries = [];
  let customBody = false;
  for await (const path of files(root)) {
    if (!path.endsWith('.html')) continue;
    const bytes = await readFile(path);
    // A raw marker can over-include a page (safe), never discard a real
    // attribute. Confirm at least one real attribute before omitting anything.
    const source = bytes.toString('latin1');
    const candidate = /data-pagefind-body/i.test(source);
    if (!customBody && candidate) customBody = hasBodyAttribute(source);
    entries.push([relative(root, path).replaceAll('\\', '/'), digest(bytes), candidate]);
  }
  if (!entries.length) throw new Error('Cannot cache search for an empty HTML site.');
  // Pagefind excludes unmarked pages only if the site has a custom body.
  // Keep complete HTML, including head metadata, filters and build identity.
  const included = customBody ? entries.filter(([, , candidate]) => candidate) : entries;
  const environment = Object.entries(process.env)
    .filter(([name]) => name.startsWith('PAGEFIND_'))
    .sort(([a], [b]) => a.localeCompare(b, 'en'));
  return {
    key: digest(JSON.stringify(['pagefind-v1', environment, included])),
    htmlFiles: entries.length,
    keyedHtmlFiles: included.length,
  };
}

/** @param {URL} dir */
async function bundleManifest(dir) {
  const root = fileURLToPath(dir);
  const entries = [];
  for await (const path of files(root)) {
    entries.push([relative(root, path).replaceAll('\\', '/'), digest(await readFile(path))]);
  }
  return JSON.stringify(entries);
}

/**
 * cacheDir must be the incremental-build compatibility partition, which
 * includes configuration, lockfiles, patches, runtime and build mode.
 * @param {URL} cacheDir
 * @param {boolean} [force]
 * @returns {import('astro').AstroIntegration}
 */
export function pagefindCacheIntegration(cacheDir, force = false) {
  const manifestPath = new URL('pagefind-cache.json', cacheDir);
  const bundleDir = new URL('pagefind-bundle/', cacheDir);
  return {
    name: 'aspire-pagefind-cache',
    hooks: {
      'astro:config:done': ({ config }) => {
        const integrations = config.integrations.filter(
          ({ name }) => name === '@astrojs/starlight'
        );
        const starlight = integrations[0];
        const original = starlight?.hooks['astro:build:done'];
        if (integrations.length !== 1 || typeof original !== 'function') {
          throw new Error('Search caching requires exactly one Starlight build-done hook.');
        }
        starlight.hooks['astro:build:done'] = async function (options) {
          const started = performance.now();
          const input = await pagefindInputKey(options.dir);
          let reused = false;
          let reason = force ? 'force' : 'missing';
          if (!force) {
            try {
              const saved = JSON.parse(await readFile(manifestPath, 'utf8'));
              if (!saved || typeof saved !== 'object' || typeof saved.key !== 'string') {
                reason = 'damaged';
                options.logger.warn('Invalid Pagefind cache manifest; rebuilding search.');
              } else if (saved.key !== input.key) {
                reason = 'inputs';
              } else if (
                typeof saved.files !== 'string' ||
                saved.files === '[]' ||
                saved.files !== (await bundleManifest(bundleDir))
              ) {
                reason = 'damaged';
                options.logger.warn('Pagefind cache differs from its manifest; rebuilding search.');
              } else {
                reused = true;
                reason = 'hit';
              }
            } catch (error) {
              if (error instanceof SyntaxError) {
                reason = 'damaged';
                options.logger.warn('Invalid Pagefind cache JSON; rebuilding search.');
              } else if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                reason = 'missing';
              } else {
                throw error;
              }
            }
          }
          if (reused) {
            const output = new URL('pagefind/', options.dir);
            await rm(output, { recursive: true, force: true });
            await cp(bundleDir, output, { recursive: true });
          } else {
            await original.call(this, options);
            const output = new URL('pagefind/', options.dir);
            const manifest = await bundleManifest(output);
            if (manifest === '[]') throw new Error('Pagefind produced an empty search bundle.');
            await mkdir(cacheDir, { recursive: true });
            // An interrupted replacement must be a miss, never a partial hit.
            await rm(manifestPath, { force: true });
            await rm(bundleDir, { recursive: true, force: true });
            await cp(output, bundleDir, { recursive: true });
            const temporary = new URL(`pagefind-cache.${process.pid}.tmp`, cacheDir);
            await writeFile(temporary, JSON.stringify({ key: input.key, files: manifest }));
            await rename(temporary, manifestPath);
          }
          console.log(
            `[incremental-build] pagefind ${JSON.stringify({
              ...input,
              reused,
              reason,
              wallMs: performance.now() - started,
            })}`
          );
        };
      },
    },
  };
}
