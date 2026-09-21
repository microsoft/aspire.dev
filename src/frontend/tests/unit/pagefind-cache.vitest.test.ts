import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AstroConfig, AstroIntegration, AstroIntegrationLogger, HookParameters } from 'astro';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagefindCacheIntegration, pagefindInputKey } from '../../config/pagefind-cache.mjs';
import { pagefindManifestIntegration } from '../../config/pagefind-manifest.mjs';
import { buildManifest } from '../../scripts/compare-builds.mjs';

type BuildHook = NonNullable<AstroIntegration['hooks']['astro:build:done']>;
const roots: string[] = [];
const html =
  '<html lang="en"><head><title>Title</title></head><body><main data-pagefind-body><h1>Title</h1>Searchable content</main></body></html>';
const logger: AstroIntegrationLogger = {
  label: 'fixture',
  options: { level: 'silent', destination: { write: () => {} } },
  fork: () => logger,
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  flush: vi.fn(),
  close: vi.fn(),
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function put(dir: URL, path: string, body: string) {
  const target = new URL(path, dir);
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, body);
}

async function fixture(original?: BuildHook, force = false) {
  const root = await mkdtemp(join(tmpdir(), 'aspire-search-cache-'));
  roots.push(root);
  const dir = pathToFileURL(join(root, 'dist') + sep);
  const cacheDir = pathToFileURL(join(root, 'cache') + sep);
  await put(dir, 'docs/index.html', html);
  await put(
    dir,
    'reference/api/test/index.html',
    '<html lang="fr"><body>Excluded API</body></html>'
  );
  const build = vi.fn<BuildHook>(
    original ??
      (async () => {
        await put(dir, 'pagefind/pagefind-entry.json', '{"languages":{"en":{"page_count":1}}}');
        await put(dir, 'pagefind/fragment/data.pf_fragment', 'binary fixture');
      })
  );
  const starlight: AstroIntegration = {
    name: '@astrojs/starlight',
    hooks: { 'astro:build:done': build },
  };
  const integration = pagefindCacheIntegration(cacheDir, force);
  const setup: HookParameters<'astro:config:done'> = {
    config: { integrations: [starlight] } as AstroConfig,
    logger,
    setAdapter: vi.fn(),
    injectTypes: () => dir,
    buildOutput: 'static',
  };
  await integration.hooks['astro:config:done']!(setup);
  const options: HookParameters<'astro:build:done'> = { dir, logger, pages: [], assets: new Map() };
  return {
    dir,
    cacheDir,
    build,
    starlight,
    setup,
    integration,
    options,
    async run() {
      await rm(new URL('pagefind/', dir), { recursive: true, force: true });
      await starlight.hooks['astro:build:done']!.call(starlight.hooks, options);
      await pagefindManifestIntegration().hooks['astro:build:done']({ dir });
      return buildManifest(fileURLToPath(new URL('pagefind/', dir)));
    },
  };
}

describe('Pagefind effective-input fingerprint', () => {
  it('omits unmarked pages only when a real custom body exists and includes newly indexed pages', async () => {
    const f = await fixture();
    const before = await pagefindInputKey(f.dir);
    expect(before).toMatchObject({ htmlFiles: 2, keyedHtmlFiles: 1 });
    await put(
      f.dir,
      'reference/api/test/index.html',
      '<html lang="de"><body>Edited API</body></html>'
    );
    expect((await pagefindInputKey(f.dir)).key).toBe(before.key);
    await put(f.dir, 'another-api.html', '<body>New API</body>');
    expect((await pagefindInputKey(f.dir)).key).toBe(before.key);
    await put(f.dir, 'another-api.html', html.replace('data-pagefind-body', 'DATA-PAGEFIND-BODY'));
    expect((await pagefindInputKey(f.dir)).key).not.toBe(before.key);
  });

  it('includes complete HTML, identity, metadata, URL inventory and language', async () => {
    const f = await fixture();
    const before = (await pagefindInputKey(f.dir)).key;
    for (const changed of [
      html.replace('Title', 'New metadata'),
      html.replace('lang="en"', 'lang="ja"'),
      html.replace('</head>', '<meta name="git-commit-id" content="new"></head>'),
      html.replace('</main>', '<p data-pagefind-filter="kind">Guide</p></main>'),
      html.replace('Searchable content', 'Changed body'),
    ]) {
      await put(f.dir, 'docs/index.html', changed);
      expect((await pagefindInputKey(f.dir)).key).not.toBe(before);
    }
    await put(f.dir, 'docs/index.html', html);
    await put(f.dir, 'renamed/index.html', html);
    await rm(new URL('docs/index.html', f.dir));
    expect((await pagefindInputKey(f.dir)).key).not.toBe(before);
  });

  it('does not mistake comments or script strings for a custom body that could hide other pages', async () => {
    const f = await fixture();
    await put(
      f.dir,
      'docs/index.html',
      '<body><!-- data-pagefind-body --><script>"<main data-pagefind-body>"</script></body>'
    );
    const before = await pagefindInputKey(f.dir);
    expect(before.keyedHtmlFiles).toBe(2);
    await put(f.dir, 'reference/api/test/index.html', '<body>Changed</body>');
    expect((await pagefindInputKey(f.dir)).key).not.toBe(before.key);
  });
});

describe('Pagefind bundle reuse', () => {
  it('restores every file without calling the indexer, preserving its receiver and finalization', async () => {
    const f = await fixture();
    const first = await f.run();
    expect(await f.run()).toEqual(first);
    expect(f.build).toHaveBeenCalledOnce();
    expect(f.build.mock.contexts[0]).toBe(f.starlight.hooks);
    expect(f.build).toHaveBeenCalledWith(f.options);
    await put(f.dir, 'reference/api/test/index.html', '<body>API-only mutation</body>');
    expect(await f.run()).toEqual(first);
    expect(f.build).toHaveBeenCalledOnce();
    await put(f.dir, 'docs/index.html', html.replace('Title', 'Changed'));
    await f.run();
    expect(f.build).toHaveBeenCalledTimes(2);
  });

  it.each(['missing-file', 'changed-file', 'extra-file', 'invalid-json', 'invalid-schema'])(
    'rebuilds a %s cache without restoring stale output',
    async (damage) => {
      const f = await fixture();
      const expected = await f.run();
      if (damage === 'missing-file')
        await rm(new URL('pagefind-bundle/fragment/data.pf_fragment', f.cacheDir));
      if (damage === 'changed-file')
        await put(f.cacheDir, 'pagefind-bundle/fragment/data.pf_fragment', 'bad');
      if (damage === 'extra-file') await put(f.cacheDir, 'pagefind-bundle/stale.js', 'bad');
      if (damage === 'invalid-json') await put(f.cacheDir, 'pagefind-cache.json', '{');
      if (damage === 'invalid-schema') await put(f.cacheDir, 'pagefind-cache.json', 'null');
      expect(await f.run()).toEqual(expected);
      expect(f.build).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalled();
      expect(await f.run()).toEqual(expected);
      expect(f.build).toHaveBeenCalledTimes(2);
    }
  );

  it('honors force instead of restoring an otherwise valid bundle', async () => {
    const f = await fixture(undefined, true);
    await f.run();
    await f.run();
    expect(f.build).toHaveBeenCalledTimes(2);
  });

  it('propagates indexing failure and does not publish a successful cache', async () => {
    const f = await fixture();
    f.build.mockRejectedValueOnce(new Error('Indexer failed'));
    await expect(f.run()).rejects.toThrow('Indexer failed');
    await expect(readFile(new URL('pagefind-cache.json', f.cacheDir))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('fails closed when Starlight integration ownership changes', async () => {
    const f = await fixture();
    f.setup.config.integrations = [];
    expect(() => f.integration.hooks['astro:config:done']!(f.setup)).toThrow('exactly one');
    f.setup.config.integrations = [f.starlight, f.starlight];
    expect(() => f.integration.hooks['astro:config:done']!(f.setup)).toThrow('exactly one');
  });

  it('matches the real Starlight/Pagefind index after excluded edits and invalidates indexed edits', async () => {
    const module: { starlightPagefind: BuildHook } = await import(
      new URL('./integrations/pagefind.js', import.meta.resolve('@astrojs/starlight')).href
    );
    const original: BuildHook = module.starlightPagefind;
    const f = await fixture(original);
    const initial = await f.run();
    await put(
      f.dir,
      'reference/api/test/index.html',
      '<html lang="zh"><head><title>Different API</title></head><body>New words</body></html>'
    );
    expect(await f.run()).toEqual(initial);
    expect(f.build).toHaveBeenCalledOnce();
    await original(f.options);
    await pagefindManifestIntegration().hooks['astro:build:done']({ dir: f.dir });
    expect(await buildManifest(fileURLToPath(new URL('pagefind/', f.dir)))).toEqual(initial);
    await put(
      f.dir,
      'docs/index.html',
      html.replace('Searchable content', 'Changed searchable text')
    );
    const changed = await f.run();
    expect(changed).not.toEqual(initial);
    expect(f.build).toHaveBeenCalledTimes(2);
    expect(await f.run()).toEqual(changed);
  });
});
