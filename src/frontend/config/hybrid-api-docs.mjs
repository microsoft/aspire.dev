// @ts-check
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryCache } from 'astro/config';
import { buildApiRouteCatalog } from '../src/utils/api-route-catalog.ts';

/** @returns {Pick<import('astro').AstroUserConfig, 'cache'>} */
export function hybridApiCacheConfig() {
  return {
    cache: { provider: memoryCache({ max: 128, query: { exclude: [] } }) },
  };
}

/**
 * API pages rendered on demand. The two landing pages stay prerendered: they are the heaviest
 * and most visited pages, and rendering them on demand made them an easy way to exhaust a worker.
 * @param {string} component
 */
export function isApiRouteComponent(component) {
  const path = component.replace(/\\/g, '/');
  return /(?:^|\/)src\/pages\/reference\/api\//.test(path)
    && !/(?:^|\/)src\/pages\/reference\/api\/(?:csharp|typescript)(?:\/index\.astro|\.md\.ts)$/.test(path);
}

/** @param {string} root @param {string | undefined} requested */
export function hybridOutputDirectory(root, requested) {
  const directory = resolve(root, requested || 'dist-hybrid');
  const expected = resolve(root, 'dist-hybrid');
  const matches = process.platform === 'win32'
    ? directory.toLowerCase() === expected.toLowerCase() : directory === expected;
  if (!matches) {
    throw new Error('Hybrid output must use dist-hybrid, outside the normal dist/, public/ and wwwroot/ roots.');
  }
  return directory;
}

/** @template T @param {string} directory @returns {Promise<T[]>} */
async function readDocuments(directory) {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(files.map(async (name) => JSON.parse(await readFile(resolve(directory, name), 'utf8'))));
}

/** @param {string} directory @param {import('node:crypto').Hash} hash */
async function hashDirectory(directory, hash, prefix = '') {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) await hashDirectory(path, hash, `${name}/`);
    else if (entry.isFile()) hash.update(name).update(await readFile(path));
  }
}

/**
 * @param {Record<string, string | { destination: string, status: number }>} redirects
 * @returns {import('astro').AstroIntegration}
 */
export function hybridApiDocsIntegration(redirects) {
  let root = '';
  let out = '';
  let site = '';
  return {
    name: 'aspire-hybrid-api-docs',
    hooks: {
      'astro:route:setup': ({ route }) => {
        if (isApiRouteComponent(route.component)) route.prerender = false;
      },
      'astro:config:done': ({ config }) => {
        root = fileURLToPath(config.root);
        out = fileURLToPath(config.outDir);
        if (!config.site) throw new Error('Hybrid API documentation requires a configured site URL.');
        site = config.site.replace(/\/$/, '');
      },
      'astro:build:done': async () => {
        /** @type {[import('../src/utils/packages').PackageApiDocument[], import('../src/utils/ts-modules').TsApiDocument[]]} */
        const [packages, modules] = await Promise.all([
          readDocuments(resolve(root, 'src/data/pkgs')),
          readDocuments(resolve(root, 'src/data/ts-modules')),
        ]);
        const routes = buildApiRouteCatalog(packages, modules);
        const redirectEntries = Object.entries(redirects).map(([path, value]) => ({
          path, destination: typeof value === 'string' ? value : value.destination,
          status: typeof value === 'string' ? 301 : value.status,
        }));
        await cp(resolve(root, '../statichost/StaticHost/wwwroot/scalar'),
          resolve(out, 'client/scalar'), { recursive: true });
        const rendererClient = resolve(out, 'renderer/client');
        await mkdir(resolve(rendererClient, '_astro'), { recursive: true });
        for (const file of await readdir(resolve(out, 'client/_astro'))) {
          if (['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'].includes(extname(file).toLowerCase())) {
            await cp(resolve(out, 'client/_astro', file), resolve(rendererClient, '_astro', file));
          }
        }
        await cp(resolve(out, 'client/404.html'), resolve(rendererClient, '404.html'));
        await cp(resolve(root, '.starlight-icons'), resolve(out, 'renderer/.starlight-icons'), { recursive: true });
        await mkdir(resolve(out, 'server/src/data/twoslash'), { recursive: true });
        await cp(resolve(root, 'src/data/twoslash/aspire.d.ts'), resolve(out, 'server/src/data/twoslash/aspire.d.ts'));
        const hash = createHash('sha256');
        hash.update(JSON.stringify({ routes, redirects: redirectEntries, site, platform: process.platform }));
        await hashDirectory(resolve(out, 'client'), hash, 'client/');
        await hashDirectory(resolve(out, 'server'), hash, 'server/');
        const manifest = {
          schemaVersion: 1, mode: 'hybrid-api-docs', buildId: hash.digest('hex'),
          platform: process.platform,
          client: 'client', server: 'server/entry.mjs', site,
          routes, redirects: redirectEntries,
        };
        await writeFile(resolve(out, 'hybrid-api-docs.json'), JSON.stringify(manifest));
        const urls = routes.filter(({ html }) => html).map(({ html }) => `<url><loc>${site}${html}</loc></url>`).join('');
        await writeFile(resolve(out, 'client/sitemap-api.xml'),
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
        const sitemap = resolve(out, 'client/sitemap-index.xml');
        const content = await readFile(sitemap, 'utf8');
        await writeFile(sitemap, content.replace('</sitemapindex>',
          `<sitemap><loc>${site}/sitemap-api.xml</loc></sitemap></sitemapindex>`));
      },
    },
  };
}
