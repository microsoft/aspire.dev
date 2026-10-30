import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { hybridApiDocsIntegration, hybridOutputDirectory, isApiRouteComponent, hybridApiCacheConfig } from '../../config/hybrid-api-docs.mjs';
import { buildApiRouteCatalog, getCSharpRouteEntries, getTypeScriptRouteEntries } from '@utils/api-route-catalog';
import type { PackageApiDocument } from '@utils/packages';
import type { TsApiDocument } from '@utils/ts-modules';
import { onRequest } from '../../src/middleware';
import { verifyHybridOutput } from '../../scripts/verify-hybrid-output.mjs';

describe('hybrid API documentation build', () => {
  it('uses the official native in-memory provider', () => {
    const config = hybridApiCacheConfig();
    expect(config.cache?.provider).toMatchObject({
      entrypoint: 'astro/cache/memory',
      config: { max: 128, query: { exclude: [] } },
    });
  });

  it('only opts API HTML and Markdown entrypoints out of prerendering', async () => {
    const setup = hybridApiDocsIntegration({}).hooks['astro:route:setup'];
    if (!setup) throw new Error('Missing route setup hook.');
    for (const component of [
      'src/pages/reference/api/csharp/[package]/index.astro',
      'E:\\repo\\src\\pages\\reference\\api\\typescript\\[module].md.ts',
      '/repo/src/pages/reference/api/typescript/[module]/[item]/index.astro',
    ]) {
      const route = { component, prerender: true };
      await Reflect.apply(setup, undefined, [{ route }]);
      expect(route.prerender).toBe(false);
    }
    for (const component of [
      'src/content/docs/reference/api-guidance.mdx',
      'src/pages/reference/samples/[sample].md.ts',
      'src/pages/reference/api-search/typescript.json.ts',
      'src/pages/reference/api-search/csharp/[package].json.ts',
      'src/pages/reference/api/csharp/index.astro',
      'E:\\repo\\src\\pages\\reference\\api\\typescript\\index.astro',
      'src/pages/reference/api/csharp.md.ts',
      '/repo/src/pages/reference/api/typescript.md.ts',
    ]) {
      expect(isApiRouteComponent(component)).toBe(false);
      const route = { component, prerender: true };
      await Reflect.apply(setup, undefined, [{ route }]);
      expect(route.prerender).toBe(true);
    }
  });

  it('isolates output and rejects publishing the server in a public root', () => {
    const root = resolve('test-project');
    expect(hybridOutputDirectory(root, undefined)).toBe(resolve(root, 'dist-hybrid'));
    expect(() => hybridOutputDirectory(root, 'public/build')).toThrow('public/');
    expect(() => hybridOutputDirectory(root, '../StaticHost/wwwroot')).toThrow('wwwroot');
    expect(() => hybridOutputDirectory(root, 'dist')).toThrow('dist-hybrid');
    expect(() => hybridOutputDirectory(root, 'src')).toThrow('dist-hybrid');
  });

  it('writes a relocatable private manifest and static API sitemap without page props', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'aspire-hybrid-manifest-'));
    try {
      const root = resolve(directory, 'frontend');
      const out = resolve(root, 'dist-hybrid');
      for (const path of ['src/data/pkgs', 'src/data/ts-modules', 'src/data/twoslash', '.starlight-icons', 'dist-hybrid/client/_astro', 'dist-hybrid/server']) {
        await mkdir(resolve(root, path), { recursive: true });
      }
      await mkdir(resolve(directory, 'statichost/StaticHost/wwwroot/scalar'), { recursive: true });
      await writeFile(resolve(directory, 'statichost/StaticHost/wwwroot/scalar/theme.css'), 'scalar styles');
      await writeFile(resolve(out, 'client/sitemap-index.xml'), '<sitemapindex></sitemapindex>');
      await writeFile(resolve(out, 'client/404.html'), 'not found');
      await writeFile(resolve(out, 'client/_astro/logo.svg'), '<svg/>');
      await writeFile(resolve(out, 'client/_astro/image.PNG'), 'image bytes');
      await writeFile(resolve(out, 'client/_astro/script.js'), 'client script');
      await writeFile(resolve(root, '.starlight-icons/version.txt'), 'test');
      await writeFile(resolve(root, 'src/data/twoslash/aspire.d.ts'), 'export {};');
      await writeFile(resolve(root, 'src/data/pkgs/test.json'), JSON.stringify({
        package: { name: 'Test.Package' }, types: [{ name: 'Thing', kind: 'class' }],
      }));
      await writeFile(resolve(out, 'server/entry.mjs'), 'export const handler = () => {};');
      const integration = hybridApiDocsIntegration({ '/old/': '/new/' });
      const configure = integration.hooks['astro:config:done'];
      const done = integration.hooks['astro:build:done'];
      if (!configure || !done) throw new Error('Missing hybrid build hooks.');
      await Reflect.apply(configure, undefined, [{
        config: { root: pathToFileURL(root + '/'), outDir: pathToFileURL(out + '/'), site: 'https://aspire.dev' },
      }]);
      await Reflect.apply(done, undefined, [{}]);
      const manifest = JSON.parse(await readFile(resolve(out, 'hybrid-api-docs.json'), 'utf8')) as {
        buildId: string; client: string; server: string; routes: { html: string; markdown: string }[];
      };
      expect(manifest.buildId).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.client).toBe('client');
      expect(manifest.server).toBe('server/entry.mjs');
      expect(manifest.routes.map(({ html }) => html)).toEqual([
        '/reference/api/csharp/test.package/', '/reference/api/csharp/test.package/thing/',
      ]);
      const sitemap = await readFile(resolve(out, 'client/sitemap-api.xml'), 'utf8');
      expect(sitemap).toContain('https://aspire.dev/reference/api/csharp/test.package/thing/');
      expect(sitemap).not.toContain('https://aspire.dev/reference/api/typescript/</loc>');
      expect(await readFile(resolve(out, 'client/scalar/theme.css'), 'utf8')).toBe('scalar styles');
      expect(await readFile(resolve(out, 'renderer/client/_astro/logo.svg'), 'utf8')).toBe('<svg/>');
      expect((await readdir(resolve(out, 'renderer/client/_astro'))).sort()).toEqual(['image.PNG', 'logo.svg']);
      expect(await readFile(resolve(out, 'renderer/client/404.html'), 'utf8')).toBe('not found');
      expect(await readFile(resolve(out, 'renderer/.starlight-icons/version.txt'), 'utf8')).toBe('test');
      expect(await readFile(resolve(out, 'server/src/data/twoslash/aspire.d.ts'), 'utf8')).toBe('export {};');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('serves built API Markdown by extension, keeps the dev redirect and leaves prerendered endpoints alone', async () => {
    const url = 'https://aspire.dev/reference/api/typescript/aspire.hosting/item.md';
    const render = async (isPrerendered: boolean): Promise<Response> => {
      const response: Response = await Reflect.apply(onRequest, undefined, [{
        request: new Request(url), isPrerendered, cache: { enabled: false },
      }, () => Promise.resolve(new Response('Markdown endpoint'))]);
      return response;
    };
    try {
      vi.stubEnv('DEV', false);
      expect((await render(false)).status).toBe(200);
      vi.stubEnv('DEV', true);
      expect((await render(false)).status).toBe(308);
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await render(true)).status).toBe(200);
  });
});

describe('API route catalogue', () => {
  it('checks emitted output rather than merely trusting route prerender flags', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'aspire-hybrid-output-'));
    try {
      const hybrid = resolve(directory, 'hybrid');
      await mkdir(resolve(hybrid, 'client'), { recursive: true });
      await mkdir(resolve(hybrid, 'server'), { recursive: true });
      await mkdir(resolve(hybrid, 'client/reference/api-search'), { recursive: true });
      await writeFile(resolve(hybrid, 'client/reference/api-search/typescript.json'), '[]');
      await mkdir(resolve(hybrid, 'client/reference/api/csharp'), { recursive: true });
      await mkdir(resolve(hybrid, 'client/reference/api/typescript'), { recursive: true });
      const landings = ['csharp/index.html', 'typescript/index.html', 'csharp.md', 'typescript.md'];
      for (const landing of landings) {
        await writeFile(resolve(hybrid, 'client/reference/api', landing), 'landing');
      }
      for (const file of ['index.html', '404.html', 'llms.txt', 'sitemap-index.xml']) {
        await writeFile(resolve(hybrid, 'client', file), 'static');
      }
      await writeFile(resolve(hybrid, 'server/entry.mjs'), 'renderer');
      await writeFile(resolve(hybrid, 'client/sitemap-api.xml'),
        '<loc>https://aspire.dev/reference/api/csharp/package/</loc>');
      await writeFile(resolve(hybrid, 'hybrid-api-docs.json'), JSON.stringify({
        mode: 'hybrid-api-docs', schemaVersion: 1, buildId: 'test', client: 'client', site: 'https://aspire.dev',
        routes: [{ html: '/reference/api/csharp/package/', markdown: '/reference/api/csharp/package.md' }], redirects: [],
      }));
      expect((await verifyHybridOutput(hybrid)).apiRoutes).toBe(1);
      await mkdir(resolve(hybrid, 'client/reference/api/csharp/package'), { recursive: true });
      await writeFile(resolve(hybrid, 'client/reference/api/csharp/package/index.html'), 'unexpected API');
      await expect(verifyHybridOutput(hybrid)).rejects.toThrow('API HTML/Markdown was prerendered.');
      await rm(resolve(hybrid, 'client/reference/api/csharp/package/index.html'));
      await rm(resolve(hybrid, 'client/reference/api/typescript.md'));
      await expect(verifyHybridOutput(hybrid)).rejects.toThrow('The API landing pages must stay prerendered');
      await writeFile(resolve(hybrid, 'client/reference/api/typescript.md'), 'landing');
      await rm(resolve(hybrid, 'client/reference/api-search/typescript.json'));
      await expect(verifyHybridOutput(hybrid)).rejects.toThrow('Missing API search index.');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('retains C# generic arity and only existing member-kind groups', () => {
    const pkg: PackageApiDocument = {
      package: { name: 'Test.Package', version: '1', targetFramework: 'net10.0' },
      types: [{ name: 'Thing', kind: 'class', genericParameters: [{ name: 'T' }],
        members: [{ name: 'Run', kind: 'method' }] }],
    };
    expect(getCSharpRouteEntries(pkg).map(({ html }) => html)).toEqual([
      '/reference/api/csharp/test.package/',
      '/reference/api/csharp/test.package/thing-1/',
      '/reference/api/csharp/test.package/thing-1/methods/',
    ]);
  });

  it('keeps collision-safe peers and last-entry Markdown aliases', () => {
    const first = { name: 'Thing', capabilities: [{ name: 'Run', kind: 'Method' }] };
    const last = { name: 'Thing', capabilities: [{ name: 'Run', kind: 'Method' }] };
    const pkg: TsApiDocument = { package: { name: 'Test' }, handleTypes: [first, last] };
    const routes = getTypeScriptRouteEntries(pkg);
    expect(routes.find(({ markdown }) => markdown === '/reference/api/typescript/test/thing.md')?.props.item).toBe(last);
    expect(routes.find(({ markdown }) => markdown === '/reference/api/typescript/test/thing/run.md')?.props.parentType).toBe(last);
    expect(routes.filter(({ html }) => html).every(({ html, markdown }) => `${html?.slice(0, -1)}.md` === markdown)).toBe(true);
  });

  it('covers both real catalogues without serializing API props into manifest routes', () => {
    function documents<T>(directory: string): T[] {
      const root = fileURLToPath(new URL(`../../src/data/${directory}/`, import.meta.url));
      return readdirSync(root).filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(readFileSync(resolve(root, file), 'utf8')) as T);
    }
    const routes = buildApiRouteCatalog(documents<PackageApiDocument>('pkgs'), documents<TsApiDocument>('ts-modules'));
    expect(routes.filter(({ html }) => html).length).toBeGreaterThan(24000);
    expect(new Set(routes.map(({ markdown }) => markdown)).size).toBe(routes.length);
    expect(routes.every((route) => Object.keys(route).length === 2)).toBe(true);
    expect(routes.map(({ html }) => html)).not.toContain('/reference/api/csharp/');
    expect(routes.map(({ html }) => html)).not.toContain('/reference/api/typescript/');
    expect(routes.every(({ markdown }) => markdown.split('/').length > 4)).toBe(true);
  });
});
