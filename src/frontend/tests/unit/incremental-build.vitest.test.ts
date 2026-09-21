import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AstroPrerenderer, RouteData } from 'astro';
import { SAXParser } from 'parse5-sax-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commitPlaceholder,
  generatedIconDigest,
  incrementalBuildSettings,
  incrementalCompatibility,
  replacePrivateBuildIdentity,
  scopeIncrementalMetadata,
  stampBuildIdentity,
  stampBuildIdentityBytes,
} from '../../config/incremental-build.mjs';
import { buildManifest, compareManifests } from '../../scripts/compare-builds.mjs';
import {
  buildArguments,
  changedIdentity,
  identityFinalization,
  pagefindMeasurement,
  restoredPaths,
} from '../../scripts/test-incremental-builds.mjs';
import { apiCacheKey } from '../../src/utils/api-build-cache';

const commit = '0123456789abcdef0123456789abcdef01234567';
const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'aspire-incremental-'));
  roots.push(root);
  return root;
}

async function put(root: string, name: string, content: string) {
  const path = join(root, name);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
}

describe('incremental prerender metadata scope', () => {
  function rendererFixture() {
    const api: RouteData = {
      route: '/api/[slug]',
      component: 'src/pages/api/[slug].astro',
      params: ['slug'],
      distURL: [],
      pattern: /^\/api\/[^/]+\/?$/,
      segments: [],
      type: 'page',
      prerender: true,
      fallbackRoutes: [],
      isIndex: false,
      origin: 'project',
    };
    const docs: RouteData = { ...api, component: 'starlight/route.astro' };
    const markdown: RouteData = {
      ...api,
      component: 'src/pages/api/[slug].md.ts',
      type: 'endpoint',
    };
    const paths = [
      { pathname: '/api/test', route: api, cacheKey: 'html-key' },
      { pathname: '/api/test.md', route: markdown, cacheKey: '' },
      { pathname: '/docs/test', route: docs },
      { pathname: '/api/uncached-sibling', route: api },
    ];
    const result = {
      response: new Response('unchanged body', {
        status: 201,
        headers: { 'x-custom': 'preserved' },
      }),
      metadata: { contentEntryKeys: ['src/content/test.mdx'], staticImages: [] },
    };
    const images: Awaited<ReturnType<NonNullable<AstroPrerenderer['collectStaticImages']>>> =
      new Map();
    const delegate = {
      name: 'test',
      setup: vi.fn<NonNullable<AstroPrerenderer['setup']>>().mockResolvedValue(undefined),
      getStaticPaths: vi.fn<AstroPrerenderer['getStaticPaths']>().mockResolvedValue(paths),
      render: vi.fn<AstroPrerenderer['render']>().mockResolvedValue(result),
      collectStaticImages: vi
        .fn<NonNullable<AstroPrerenderer['collectStaticImages']>>()
        .mockResolvedValue(images),
      teardown: vi.fn<NonNullable<AstroPrerenderer['teardown']>>().mockResolvedValue(undefined),
    } satisfies AstroPrerenderer;
    return { api, docs, markdown, paths, result, images, delegate };
  }

  it('retains metadata for keyed HTML and Markdown without changing responses or static paths', async () => {
    const { api, markdown, paths, result, delegate } = rendererFixture();
    const scoped = scopeIncrementalMetadata(delegate);
    expect(await scoped.getStaticPaths()).toBe(paths);
    for (const routeData of [api, markdown]) {
      const request = new Request('https://example.com/base/api/encoded%20path/');
      const options = { routeData, collectMetadata: true };
      expect(await scoped.render(request, options)).toBe(result);
      expect(delegate.render).toHaveBeenLastCalledWith(request, options);
      expect(delegate.render.mock.contexts.at(-1)).toBe(delegate);
    }
  });

  it('bypasses uncached components while conservatively tracking mixed components', async () => {
    const { api, docs, delegate } = rendererFixture();
    const scoped = scopeIncrementalMetadata(delegate);
    await scoped.getStaticPaths();
    for (const routeData of [docs, api]) {
      const request = new Request('https://example.com/uncached/');
      const options = { routeData, collectMetadata: true };
      await scoped.render(request, options);
      expect(delegate.render).toHaveBeenLastCalledWith(request, {
        routeData,
        collectMetadata: routeData === api,
      });
      expect(options.collectMetadata).toBe(true);
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await scoped.teardown?.();
      expect(log).toHaveBeenCalledWith(
        '[incremental-build] prerender metadata {"trackedPages":1,"bypassedPages":1}'
      );
    } finally {
      log.mockRestore();
    }
  });

  it.each([false, undefined])(
    'does not enable unrequested metadata collection (%s)',
    async (collectMetadata) => {
      const { api, delegate } = rendererFixture();
      const scoped = scopeIncrementalMetadata(delegate);
      await scoped.getStaticPaths();
      const request = new Request('https://example.com/api/test/');
      await scoped.render(request, { routeData: api, collectMetadata });
      expect(delegate.render).toHaveBeenCalledWith(request, { routeData: api, collectMetadata });
    }
  );

  it('forwards setup, image collection and teardown with the original receiver', async () => {
    const { images, delegate } = rendererFixture();
    const scoped = scopeIncrementalMetadata(delegate);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await scoped.setup?.();
      expect(await scoped.collectStaticImages?.()).toBe(images);
      await scoped.teardown?.();
      for (const hook of [delegate.setup, delegate.collectStaticImages, delegate.teardown]) {
        expect(hook).toHaveBeenCalledOnce();
        expect(hook.mock.contexts[0]).toBe(delegate);
      }
    } finally {
      log.mockRestore();
    }
  });

  it('refreshes the scope when static paths are enumerated again', async () => {
    const { api, paths, delegate } = rendererFixture();
    const scoped = scopeIncrementalMetadata(delegate);
    await scoped.getStaticPaths();
    delegate.getStaticPaths.mockResolvedValue(
      paths.map(({ pathname, route }) => ({ pathname, route }))
    );
    await scoped.getStaticPaths();
    const request = new Request('https://example.com/api/test/');
    await scoped.render(request, { routeData: api, collectMetadata: true });
    expect(delegate.render).toHaveBeenLastCalledWith(request, {
      routeData: api,
      collectMetadata: false,
    });
  });

  it('propagates delegate failures instead of falling back to an untracked render', async () => {
    const { api, delegate } = rendererFixture();
    const scoped = scopeIncrementalMetadata(delegate);
    const error = new Error('prerender failure');
    delegate.getStaticPaths.mockRejectedValueOnce(error);
    await expect(scoped.getStaticPaths()).rejects.toBe(error);
    await scoped.getStaticPaths();
    delegate.render.mockRejectedValueOnce(error);
    await expect(
      scoped.render(new Request('https://example.com/api/test/'), {
        routeData: api,
        collectMetadata: true,
      })
    ).rejects.toBe(error);
    delegate.teardown.mockRejectedValueOnce(error);
    await expect(scoped.teardown?.()).rejects.toBe(error);
  });

  it('registers the wrapper through the public build hook', async () => {
    const root = await fixture();
    const settings = incrementalBuildSettings({
      root: pathToFileURL(root + '/'),
      mode: 'production',
      env: { PUBLIC_GIT_COMMIT_ID: commit },
    });
    const setPrerenderer = vi.fn();
    settings.integration.hooks['astro:build:start']({ setPrerenderer });
    expect(setPrerenderer).toHaveBeenCalledWith(scopeIncrementalMetadata);
  });
});

describe('incremental build identity', () => {
  const template = `<meta content="${commitPlaceholder}" name="git-commit-id">
<meta name="git-source-url" content="https://example.com/repo/blob/${commitPlaceholder}/doc?a=1&amp;b=2">
<a target="_blank" class="commit-link" href="https://example.com/commit/${commitPlaceholder}" title="Built on commit SHA: ASPRSHA">SHA ASPRSHA</a>`;

  it('stamps only designated metadata and footer without reserializing HTML', () => {
    expect(Buffer.byteLength(commitPlaceholder)).toBe(40);
    const expected = template
      .replaceAll(commitPlaceholder, commit)
      .replaceAll('ASPRSHA', '0123456');
    expect(stampBuildIdentity(template, commit)).toBe(expected);
    expect(stampBuildIdentity(expected, commit)).toBe(expected);
  });

  it('preserves UTF-8 byte positions and length when stamping buffers directly', () => {
    const source = '<p>\u{1f680} \u00e9 \u6f22\u5b57</p>\r\n' + template;
    const cache = new Map<string, { start: number; end: number }[]>();
    for (const identity of [commit, 'abcdef0123456789abcdef0123456789abcdef01']) {
      const bytes = Buffer.from(source, 'utf8');
      const length = bytes.length;
      expect(stampBuildIdentityBytes(bytes, identity, cache)).toBe(true);
      expect(bytes.length).toBe(length);
      expect(bytes.toString('utf8')).toBe(
        source.replaceAll(commitPlaceholder, identity).replaceAll('ASPRSHA', identity.slice(0, 7))
      );
      expect(stampBuildIdentityBytes(bytes, identity, cache)).toBe(false);
      expect(cache.size).toBe(1);
    }
  });

  it.each(['truncated', 'shifted'])(
    'rejects a %s cached token instead of emitting a partial SHA',
    (corruption) => {
      const cache = new Map<string, { start: number; end: number }[]>();
      stampBuildIdentity(template, commit, cache);
      const token = [...cache.values()][0][0];
      expect(token.end - token.start).toBe(40);
      if (corruption === 'truncated') {
        token.end = token.start + 7;
      } else {
        token.start++;
        token.end++;
      }
      expect(() => stampBuildIdentity(template, commit, cache)).toThrow(
        'Invalid identity range cache token'
      );
    }
  );

  it('uses the new identity when the same raw cached page is restored', () => {
    const next = 'abcdef0123456789abcdef0123456789abcdef01';
    expect(stampBuildIdentity(template, next)).toContain(`/commit/${next}`);
    expect(stampBuildIdentity(template, next)).toContain('SHA abcdef0');
    expect(stampBuildIdentity(template, next)).not.toContain(commit);
  });

  it('reuses parsed ranges only for exact source content, independently of the target identity', () => {
    const cache = new Map<string, { start: number; end: number }[]>();
    const parse = vi.spyOn(SAXParser.prototype, 'end');
    const next = 'abcdef0123456789abcdef0123456789abcdef01';
    try {
      const first = stampBuildIdentity(template, commit, cache);
      expect(parse).toHaveBeenCalledTimes(1);
      expect(cache.size).toBe(1);
      expect(stampBuildIdentity(template, next, cache)).toBe(
        template.replaceAll(commitPlaceholder, next).replaceAll('ASPRSHA', next.slice(0, 7))
      );
      expect(parse).toHaveBeenCalledTimes(1);
      expect(stampBuildIdentity(first, commit, cache)).toBe(first);
      expect(parse).toHaveBeenCalledTimes(1);

      const changed = '<p>\u{1f680} offset change</p>' + template;
      expect(stampBuildIdentity(changed, commit, cache)).toBe(
        changed.replaceAll(commitPlaceholder, commit).replaceAll('ASPRSHA', commit.slice(0, 7))
      );
      expect(parse).toHaveBeenCalledTimes(2);
      expect(cache.size).toBe(2);
      expect(() => stampBuildIdentity(template + '<p>ASPRSHA</p>', commit, cache)).toThrow(
        'Unstamped'
      );
      expect(cache.size).toBe(2);
    } finally {
      parse.mockRestore();
    }
  });

  it('preserves quoting, entities and Unicode around streamed metadata and nested footer content', () => {
    const source = `<!doctype html><p>\u{1f680} unchanged &amp; escaped &lt;a&gt;</p>
<META content='${commitPlaceholder}' name='git-commit-id'>
<a href="/unrelated">unchanged</a>
<a class='other commit-link' href='/commit/${commitPlaceholder}'><span>SHA ASPRSHA</span></a>`;
    expect(stampBuildIdentity(source, commit)).toBe(
      source.replaceAll(commitPlaceholder, commit).replaceAll('ASPRSHA', commit.slice(0, 7))
    );
  });

  it.each([
    `<!-- <meta name="git-commit-id" content="${commitPlaceholder}"> -->`,
    `<textarea><a class="commit-link">${commitPlaceholder}</a></textarea>`,
    `<style>a::after { content: '<a class="commit-link">${commitPlaceholder}</a>'; }</style>`,
  ])('does not mistake raw text or comments for identity elements', (source) => {
    expect(() => stampBuildIdentity(source, commit)).toThrow('Unstamped');
  });

  it('substitutes private fallback before Astro can inline the changing SHA', () => {
    const source =
      'const commit = import.meta.env.PUBLIC_GIT_COMMIT_ID || import.meta.env.GIT_COMMIT_ID || "";';
    for (const path of [
      'starlight/Head.astro',
      'starlight/Footer.astro',
      'MicrosoftFooter.astro',
    ]) {
      const result = replacePrivateBuildIdentity(source, `/project/src/components/${path}`, true);
      expect(result?.code).toContain(JSON.stringify(commitPlaceholder));
      expect(result?.code).not.toContain('import.meta.env.GIT_COMMIT_ID');
      expect(result?.code).toContain('import.meta.env.PUBLIC_GIT_COMMIT_ID');
    }
    expect(
      replacePrivateBuildIdentity(
        source,
        'C:\\project\\src\\components\\starlight\\Head.astro',
        false
      )?.code
    ).not.toContain(commitPlaceholder);
    expect(
      replacePrivateBuildIdentity(source, '/project/src/scripts/unrelated.ts', true)
    ).toBeUndefined();
  });

  it('rejects missing or unsafe identity and leaked placeholders', () => {
    expect(() => stampBuildIdentity(template, '')).toThrow('full git commit');
    expect(() => stampBuildIdentity(template, '<script>')).toThrow('full git commit');
    expect(() => stampBuildIdentity(`<p>${commitPlaceholder}</p>`, commit)).toThrow('Unstamped');
    expect(() => stampBuildIdentity('<p>ASPRSHA</p>', commit)).toThrow('Unstamped');
    expect(() => stampBuildIdentity(`<script>"${commitPlaceholder}"</script>`, commit)).toThrow(
      'Unstamped'
    );
    expect(() =>
      stampBuildIdentity(
        `<script>const markup = '<a class="commit-link">${commitPlaceholder}</a>';</script>`,
        commit
      )
    ).toThrow('Unstamped');
  });

  it('preserves pages without identity and fallback-only identity semantics', async () => {
    expect(stampBuildIdentity('<p>unchanged</p>', commit)).toBe('<p>unchanged</p>');
    const root = pathToFileURL((await fixture()) + '/');
    const settings = incrementalBuildSettings({
      root,
      mode: 'production',
      env: { GIT_COMMIT_ID: commit },
    });
    expect(settings.define['import.meta.env.PUBLIC_GIT_COMMIT_ID']).toBe('""');
    expect(settings.define['import.meta.env.GIT_COMMIT_ID']).toBe(
      JSON.stringify(commitPlaceholder)
    );
    expect(settings.privateIdentityPlugin).toMatchObject({
      enforce: 'pre',
      transform: { order: 'pre' },
    });
    expect(() => incrementalBuildSettings({ root, mode: 'production', env: {} })).toThrow(
      'commit identity is missing'
    );
    expect(() => incrementalBuildSettings({ root, mode: 'development', env: {} })).toThrow(
      'Unsupported incremental build mode'
    );
  });

  it('finalizes assembled HTML before build-done consumers index it, leaving raw cache reusable', async () => {
    const root = await fixture();
    await put(root, 'dist/reference/api/csharp/test/index.html', template);
    await put(root, 'dist/docs/index.html', template);
    await put(root, 'dist/test.md', 'Markdown is unchanged.');
    await put(root, 'raw-cache/index.html', template);
    const settings = incrementalBuildSettings({
      root: pathToFileURL(root + '/'),
      mode: 'production',
      env: { PUBLIC_GIT_COMMIT_ID: commit },
    });
    expect(settings.integration.hooks).not.toHaveProperty('astro:build:done');
    await settings.integration.hooks['astro:build:generated']({
      dir: pathToFileURL(join(root, 'dist') + '/'),
    });
    expect(await readFile(join(root, 'dist/docs/index.html'), 'utf8')).toContain(commit);
    expect(
      await readFile(join(root, 'dist/reference/api/csharp/test/index.html'), 'utf8')
    ).not.toContain('ASPRSHA');
    expect(await readFile(join(root, 'dist/test.md'), 'utf8')).toBe('Markdown is unchanged.');
    expect(await readFile(join(root, 'raw-cache/index.html'), 'utf8')).toBe(template);

    const rangePath = new URL('identity-ranges.json', settings.cacheDir);
    const stored = await readFile(rangePath, 'utf8');
    expect(Object.keys(JSON.parse(stored))).toHaveLength(1);
    expect(stored).not.toContain(commit);
    const next = 'abcdef0123456789abcdef0123456789abcdef01';
    const restored = incrementalBuildSettings({
      root: pathToFileURL(root + '/'),
      mode: 'production',
      env: { PUBLIC_GIT_COMMIT_ID: next },
    });
    expect(restored.cacheDir.href).toBe(settings.cacheDir.href);
    await put(root, 'dist/reference/api/csharp/test/index.html', template);
    await put(root, 'dist/docs/index.html', template);
    const parse = vi.spyOn(SAXParser.prototype, 'end');
    try {
      await restored.integration.hooks['astro:build:generated']({
        dir: pathToFileURL(join(root, 'dist') + '/'),
      });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
    expect(await readFile(join(root, 'dist/docs/index.html'), 'utf8')).toContain(next);
    expect(await readFile(rangePath, 'utf8')).toBe(stored);
    expect(await readFile(join(root, 'raw-cache/index.html'), 'utf8')).toBe(template);
  });

  it.each(['{', '[]', '{"not-a-digest":[]}', `{"${'a'.repeat(64)}":[{"start":-1,"end":2}]}`])(
    'reports invalid cached range metadata and safely reparses: %s',
    async (invalid) => {
      const root = await fixture();
      await put(root, 'dist/index.html', template);
      const settings = incrementalBuildSettings({
        root: pathToFileURL(root + '/'),
        mode: 'production',
        env: { PUBLIC_GIT_COMMIT_ID: commit },
      });
      await mkdir(settings.cacheDir, { recursive: true });
      const rangePath = new URL('identity-ranges.json', settings.cacheDir);
      await writeFile(rangePath, invalid);
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await settings.integration.hooks['astro:build:generated']({
          dir: pathToFileURL(join(root, 'dist') + '/'),
        });
        expect(warning).toHaveBeenCalledWith(expect.stringContaining('reparsing HTML'));
      } finally {
        warning.mockRestore();
      }
      expect(await readFile(join(root, 'dist/index.html'), 'utf8')).toBe(
        stampBuildIdentity(template, commit)
      );
      expect(Object.keys(JSON.parse(await readFile(rangePath, 'utf8')))).toHaveLength(1);
    }
  );

  it('does not hide range-cache filesystem failures', async () => {
    const root = await fixture();
    await put(root, 'dist/index.html', template);
    const settings = incrementalBuildSettings({
      root: pathToFileURL(root + '/'),
      mode: 'production',
      env: { PUBLIC_GIT_COMMIT_ID: commit },
    });
    await mkdir(new URL('identity-ranges.json/', settings.cacheDir), { recursive: true });
    await expect(
      settings.integration.hooks['astro:build:generated']({
        dir: pathToFileURL(join(root, 'dist') + '/'),
      })
    ).rejects.toThrow();
    expect(await readFile(join(root, 'dist/index.html'), 'utf8')).toBe(template);
  });

  it('finalizes every distinct page across bounded concurrent file workers', async () => {
    const root = await fixture();
    const count = 21;
    for (let index = 0; index < count; index++) {
      await put(root, `dist/${index}/index.html`, `<p>${index}</p>` + template);
    }
    const settings = incrementalBuildSettings({
      root: pathToFileURL(root + '/'),
      mode: 'production',
      env: { PUBLIC_GIT_COMMIT_ID: commit },
    });
    await settings.integration.hooks['astro:build:generated']({
      dir: pathToFileURL(join(root, 'dist') + '/'),
    });
    for (let index = 0; index < count; index++) {
      expect(await readFile(join(root, 'dist', String(index), 'index.html'), 'utf8')).toBe(
        stampBuildIdentity(`<p>${index}</p>` + template, commit)
      );
    }
    const cache = JSON.parse(
      await readFile(new URL('identity-ranges.json', settings.cacheDir), 'utf8')
    );
    expect(Object.keys(cache)).toHaveLength(count);
  });

  it('drains concurrent file work without publishing range metadata after a failure', async () => {
    const root = await fixture();
    for (let index = 0; index < 8; index++) {
      await put(root, `dist/${index}/index.html`, template + (index === 0 ? '<p>ASPRSHA</p>' : ''));
    }
    const settings = incrementalBuildSettings({
      root: pathToFileURL(root + '/'),
      mode: 'production',
      env: { PUBLIC_GIT_COMMIT_ID: commit },
    });
    await expect(
      settings.integration.hooks['astro:build:generated']({
        dir: pathToFileURL(join(root, 'dist') + '/'),
      })
    ).rejects.toThrow('Unstamped');
    await expect(
      readFile(new URL('identity-ranges.json', settings.cacheDir), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects out-of-bounds cached ranges and lets force rebuild their metadata', async () => {
    const root = await fixture();
    await put(root, 'dist/index.html', template);
    const options = {
      root: pathToFileURL(root + '/'),
      mode: 'production',
      env: { PUBLIC_GIT_COMMIT_ID: commit },
    };
    const settings = incrementalBuildSettings(options);
    const hook = { dir: pathToFileURL(join(root, 'dist') + '/') };
    await settings.integration.hooks['astro:build:generated'](hook);
    const rangePath = new URL('identity-ranges.json', settings.cacheDir);
    const valid = await readFile(rangePath, 'utf8');
    const invalid = Object.fromEntries(
      Object.keys(JSON.parse(valid)).map((digest) => [
        digest,
        [{ start: template.length, end: template.length + 40 }],
      ])
    );
    await writeFile(rangePath, JSON.stringify(invalid));
    await put(root, 'dist/index.html', template);
    await expect(settings.integration.hooks['astro:build:generated'](hook)).rejects.toThrow(
      'Identity range cache exceeds its source HTML'
    );
    expect(await readFile(join(root, 'dist/index.html'), 'utf8')).toBe(template);
    const forced = incrementalBuildSettings({ ...options, force: true });
    expect(forced.compatibility).toBe(settings.compatibility);
    await forced.integration.hooks['astro:build:generated'](hook);
    expect(await readFile(rangePath, 'utf8')).toBe(valid);
    expect(await readFile(join(root, 'dist/index.html'), 'utf8')).toBe(
      stampBuildIdentity(template, commit)
    );
  });
});

describe('incremental compatibility and package keys', () => {
  it.each(['production', 'skip-search'])(
    'validates the actual opt-in Astro config in %s mode without building',
    (mode) => {
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `
        import { resolveConfig } from './node_modules/astro/dist/core/config/config.js';
        process.argv.push('build', '--mode', ${JSON.stringify(mode)});
        const { astroConfig } = await resolveConfig({ mode: ${JSON.stringify(mode)} }, 'build');
        console.log(JSON.stringify({
          cacheDir: astroConfig.cacheDir.href,
          incremental: astroConfig.experimental.incrementalBuild,
          concurrency: astroConfig.build.concurrency,
          searchCache: astroConfig.integrations.some(i => i.name === 'aspire-pagefind-cache'),
        }));
      `,
        ],
        {
          cwd: fileURLToPath(new URL('../../', import.meta.url)),
          env: {
            ...process.env,
            ASPIRE_INCREMENTAL_BUILD: '1',
            ASPIRE_BUILD_CONCURRENCY: '4',
            ASTRO_TELEMETRY_DISABLED: '1',
            PUBLIC_GIT_COMMIT_ID: commit,
          },
          encoding: 'utf8',
          timeout: 30_000,
        }
      );
      expect(JSON.parse(output.trim())).toEqual({
        cacheDir: expect.stringContaining(`/node_modules/.astro-incremental/${mode}/api-v1-`),
        incremental: true,
        concurrency: 4,
        searchCache: mode === 'production',
      });
    }
  );

  it('does not opt any route in during normal builds', () => {
    vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '0');
    expect(apiCacheKey({ types: [] })).toBeUndefined();
  });

  it('does not affect the development server even if the opt-in variable is set', () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '1');
    expect(apiCacheKey({ types: [] })).toBeUndefined();
  });

  it('keys complete package data, including siblings, and memoizes immutable data', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '1');
    vi.stubEnv('ASPIRE_INCREMENTAL_ICON_DIGEST', '0'.repeat(64));
    const data = { types: [{ name: 'First' }] };
    const key = apiCacheKey(data);
    expect(key).toMatch(/^[a-f\d]{64}$/);
    expect(apiCacheKey(data)).toBe(key);
    expect(apiCacheKey(structuredClone(data))).toBe(key);
    expect(apiCacheKey({ types: [...data.types, { name: 'Sibling' }] })).not.toBe(key);
    expect(apiCacheKey({ types: [] })).not.toBe(key);
    vi.stubEnv('ASPIRE_INCREMENTAL_ICON_DIGEST', '1'.repeat(64));
    expect(apiCacheKey(data)).not.toBe(key);
  });

  it('rejects a missing generated-input digest', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '1');
    vi.stubEnv('ASPIRE_INCREMENTAL_ICON_DIGEST', '');
    expect(() => apiCacheKey({})).toThrow('not captured');
  });

  it('captures icon changes after Starlight setup rather than trusting the early cache partition', async () => {
    const root = await fixture();
    await put(root, '.starlight-icons/material-icons.json', '{"icon":"before"}');
    const settings = incrementalBuildSettings({
      root: pathToFileURL(root + '/'),
      mode: 'production',
      env: { PUBLIC_GIT_COMMIT_ID: commit },
    });
    const before = generatedIconDigest(root);
    await put(root, '.starlight-icons/material-icons.json', '{"icon":"after"}');
    const after = generatedIconDigest(root);
    expect(after).not.toBe(before);
    const updateConfig = vi.fn();
    settings.integration.hooks['astro:config:setup']({ updateConfig });
    expect(updateConfig).toHaveBeenCalledWith({
      vite: { define: { 'import.meta.env.ASPIRE_INCREMENTAL_ICON_DIGEST': JSON.stringify(after) } },
    });
  });

  it('isolates modes and global inputs while allowing API-only and identity-only reuse', async () => {
    const root = await fixture();
    await put(root, 'astro.config.mjs', 'export default {}');
    await put(root, 'src/data/pkgs/test.json', '{"types":[]}');
    await put(root, 'src/data/ts-modules/test.json', '{"functions":[]}');
    const key = incrementalCompatibility(root, 'production', { PUBLIC_GIT_COMMIT_ID: commit });
    await put(root, 'src/data/pkgs/test.json', '{"types":[1]}');
    await put(root, 'src/data/ts-modules/test.json', '{"functions":[1]}');
    expect(incrementalCompatibility(root, 'production', { PUBLIC_GIT_COMMIT_ID: 'changed' })).toBe(
      key
    );
    expect(incrementalCompatibility(root, 'skip-search', {})).not.toBe(key);
    expect(incrementalCompatibility(root, 'production', { PUBLIC_REPO_URL: 'changed' })).not.toBe(
      key
    );
    await put(root, 'src/content/docs/test.mdx', '<div class="new-global-uno-class" />');
    expect(incrementalCompatibility(root, 'production', {})).not.toBe(key);
  });

  it.each([
    '.npmrc',
    'pnpm-lock.yaml',
    'patches/search.patch',
    'src/middleware.ts',
    'src/styles/site.css',
    'src/styles/_partial.scss',
    'src/assets/original.svg',
    'src/assets/fonts/Outfit-Regular.ttf',
    'src/assets/sample-thumbnail.png',
    'public/og-image.png',
    'public/logo.png',
    'src/scripts/deployment-guard.ts',
    'config/remark-plugin.mjs',
  ])('invalidates when %s changes', async (path) => {
    const root = await fixture();
    await put(root, path, 'before');
    const before = incrementalCompatibility(root, 'production', {});
    await put(root, path, 'after');
    expect(incrementalCompatibility(root, 'production', {})).not.toBe(before);
  });

  it('does not evict APIs for the uncached RSS fallback clock', async () => {
    const root = await fixture();
    vi.stubEnv('SOURCE_DATE_EPOCH', '1');
    const before = incrementalCompatibility(root, 'production', {});
    vi.stubEnv('SOURCE_DATE_EPOCH', '2');
    expect(incrementalCompatibility(root, 'production', {})).toBe(before);
  });
});

describe('whole-output equivalence', () => {
  it('keeps ordinary full-build controls distinct from the forced-clean oracle', () => {
    expect(buildArguments('clean')).toEqual(['build', '--mode', 'production', '--force']);
    expect(buildArguments('full')).toEqual(['build', '--mode', 'production']);
    expect(buildArguments('incremental')).toEqual(['build', '--mode', 'production']);
  });

  it('requires consistent search reuse measurements', () => {
    const record = { reused: true, reason: 'hit', htmlFiles: 10, keyedHtmlFiles: 5, wallMs: 2 };
    const log = `[incremental-build] pagefind ${JSON.stringify(record)}`;
    expect(pagefindMeasurement(log)).toEqual(record);
    expect(() => pagefindMeasurement('')).toThrow('Expected one');
    expect(() => pagefindMeasurement(log + '\n' + log)).toThrow('Expected one');
    expect(() => pagefindMeasurement(log.replace('"hit"', '"inputs"'))).toThrow('Invalid');
  });
  it('records measured identity work without accepting missing, duplicate or inconsistent totals', () => {
    const measurement = { htmlFiles: 10, parsedPages: 2, reusedPages: 8, wallMs: 20.5 };
    const log = `[incremental-build] finalized identity ${JSON.stringify(measurement)}`;
    expect(identityFinalization(`other output\n\u001b[32m${log}\u001b[0m\n`)).toEqual(measurement);
    expect(() => identityFinalization('')).toThrow('Expected one');
    expect(() => identityFinalization(`${log}\n${log}`)).toThrow('Expected one');
    expect(() =>
      identityFinalization(
        `[incremental-build] finalized identity ${JSON.stringify({ ...measurement, htmlFiles: 9 })}`
      )
    ).toThrow('Invalid');
  });

  it('selects a different real identity for both PR merges and main-branch builds', () => {
    const next = 'abcdef0123456789abcdef0123456789abcdef01';
    expect(changedIdentity(commit, [next, commit])).toBe(next);
    expect(changedIdentity(commit, [commit, next])).toBe(next);
    expect(() => changedIdentity(commit, [commit, commit.toUpperCase()])).toThrow(
      'different real commit'
    );
    expect(() => changedIdentity('', [next])).toThrow('full git commit IDs');
    expect(() => changedIdentity(commit, ['not-a-commit'])).toThrow('full git commit IDs');
  });

  it('counts Astro 7.3 restored routes, not image-cache or timing messages', () => {
    expect(
      restoredPaths(
        [
          '  ├─ /reference/api/csharp/test/index.html (restored)',
          '  ├─ /reference/api/csharp/test.md (cached)',
          '  ├─ /docs/index.html (+2ms)',
          'image.png (+1ms) (reused cache entry)',
        ].join('\n')
      )
    ).toEqual(['/reference/api/csharp/test/index.html', '/reference/api/csharp/test.md']);
  });

  it('detects missing, added and changed files without filtering output types', async () => {
    const root = await fixture();
    await put(root, 'index.html', '<html>Identity and scripts must match.</html>');
    await put(root, 'pagefind/index.pf_meta', 'search');
    await put(root, 'api/test.md', '# API');
    const before = await buildManifest(root);
    expect(compareManifests(before, await buildManifest(root))).toEqual({
      missing: [],
      extra: [],
      changed: [],
    });
    await put(root, 'index.html', '<html>Changed identity.</html>');
    await rm(join(root, 'api/test.md'));
    await put(root, 'new.svg', '<svg/>');
    expect(compareManifests(before, await buildManifest(root))).toEqual({
      missing: ['api/test.md'],
      extra: ['new.svg'],
      changed: ['index.html'],
    });
  });

  it('rejects empty output instead of accepting a vacuous match', async () => {
    await expect(buildManifest(await fixture())).rejects.toThrow('empty');
  });
});
