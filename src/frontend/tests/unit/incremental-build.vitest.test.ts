import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commitPlaceholder,
  generatedIconDigest,
  incrementalBuildSettings,
  incrementalCompatibility,
  replacePrivateBuildIdentity,
  stampBuildIdentity,
} from '../../config/incremental-build.mjs';
import { buildManifest, compareManifests } from '../../scripts/compare-builds.mjs';
import { changedIdentity, restoredPaths } from '../../scripts/test-incremental-builds.mjs';
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

describe('incremental build identity', () => {
  const template = `<meta content="${commitPlaceholder}" name="git-commit-id">
<meta name="git-source-url" content="https://example.com/repo/blob/${commitPlaceholder}/doc?a=1&amp;b=2">
<a target="_blank" class="commit-link" href="https://example.com/commit/${commitPlaceholder}" title="Built on commit SHA: ASPRSHA">SHA ASPRSHA</a>`;

  it('stamps only designated metadata and footer without reserializing HTML', () => {
    const expected = template
      .replaceAll(commitPlaceholder, commit)
      .replaceAll('ASPRSHA', '0123456');
    expect(stampBuildIdentity(template, commit)).toBe(expected);
    expect(stampBuildIdentity(expected, commit)).toBe(expected);
  });

  it('uses the new identity when the same raw cached page is restored', () => {
    const next = 'abcdef0123456789abcdef0123456789abcdef01';
    expect(stampBuildIdentity(template, next)).toContain(`/commit/${next}`);
    expect(stampBuildIdentity(template, next)).toContain('SHA abcdef0');
    expect(stampBuildIdentity(template, next)).not.toContain(commit);
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
