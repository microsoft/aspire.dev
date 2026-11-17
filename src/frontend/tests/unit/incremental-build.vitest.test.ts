import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';

const frontendRoot = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);

// A miniature site built with the same flags, cache-key helpers, patched Astro and
// Bun runtime as the real one. Pages print the id of the build that rendered them, so a page
// restored from the incremental cache keeps the id of an earlier build.
const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'incremental-build-fixture', private: true, type: 'module' }),
  'astro.config.mjs': `
    import { defineConfig } from 'astro/config';
    export default defineConfig({
      cacheDir: './.astro-cache',
      experimental: { parallelPrerender: { workers: 2 }, incrementalBuild: true },
    });`,
  'src/content.config.ts': `
    import { defineCollection } from 'astro:content';
    import { glob } from 'astro/loaders';
    export const collections = {
      packages: defineCollection({ loader: glob({ pattern: '*.json', base: './data' }) }),
    };`,
  'src/pages/reference/[package]/index.astro': `---
    import { getCollection } from 'astro:content';
    import { apiDocumentCacheKey } from '../../../utils/api-cache-key';
    export async function getStaticPaths() {
      const packages = await getCollection('packages');
      return packages.map((entry) => ({
        cacheKey: apiDocumentCacheKey(entry.data),
        params: { package: entry.id },
        props: { packageName: entry.data.package.name },
      }));
    }
    const { packageName } = Astro.props;
    const packages = await getCollection('packages');
    const document = packages.find((entry) => entry.data.package.name === packageName).data;
    ---
    <p>{document.summary}|{process.env.FIXTURE_BUILD_ID}</p>`,
  'src/pages/reference/[package].md.ts': `
    import { getCollection } from 'astro:content';
    import { withApiCacheKeys } from '../../utils/api-cache-key';
    export async function getStaticPaths() {
      const packages = await getCollection('packages');
      return withApiCacheKeys(
        packages.map((entry) => ({
          params: { package: entry.id },
          props: { packageName: entry.data.package.name },
        })),
        packages
      );
    }
    export const GET = async ({ props }) => {
      const packages = await getCollection('packages');
      const document = packages.find((entry) => entry.data.package.name === props.packageName).data;
      return new Response(document.summary + '|' + process.env.FIXTURE_BUILD_ID);
    };`,
  'src/pages/og/[...slug].ts': `
    import { getCollection } from 'astro:content';
    import { ogCardCacheKey } from '../../utils/og-cache-key';
    export async function getStaticPaths() {
      const packages = await getCollection('packages');
      return packages.map((entry) => {
        const props = { title: entry.data.package.name };
        return { cacheKey: ogCardCacheKey(props), params: { slug: entry.id + '.png' }, props };
      });
    }
    export const GET = ({ props }) => new Response(props.title + '|' + process.env.FIXTURE_BUILD_ID);`,
  'src/pages/icons/[id].astro': `---
    import { Image } from 'astro:assets';
    import logo from '../../assets/logo.svg';
    export function getStaticPaths() {
      return [{ cacheKey: 'logo', params: { id: 'logo' } }];
    }
    ---
    <Image src={logo} alt="Logo" /><p>|{process.env.FIXTURE_BUILD_ID}</p>`,
  'src/assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
  'src/assets/fonts/Outfit-Regular.ttf': 'regular',
  'src/assets/fonts/Outfit-Bold.ttf': 'bold',
  'public/og-image.png': 'background',
};

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function writeProjectFile(project: string, file: string, content: string): Promise<void> {
  await mkdir(dirname(join(project, file)), { recursive: true });
  await writeFile(join(project, file), content);
}

async function createProject(): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), 'aspire-incremental-build-'));
  directories.push(project);
  await symlink(join(frontendRoot, 'node_modules'), join(project, 'node_modules'), 'junction');
  for (const [file, content] of Object.entries(FILES)) {
    await writeProjectFile(project, file, content);
  }
  await mkdir(join(project, 'src/utils'), { recursive: true });
  for (const helper of ['api-cache-key.ts', 'deployment-metadata.ts', 'og-cache-key.ts']) {
    await copyFile(join(frontendRoot, 'src/utils', helper), join(project, 'src/utils', helper));
  }
  return project;
}

function writeDocument(project: string, name: string, summary: string): Promise<void> {
  return writeProjectFile(project, `data/${name}.json`, JSON.stringify({ package: { name }, summary }));
}

async function build(project: string, buildId: string, commit = 'commit-a'): Promise<void> {
  const { NODE_ENV: _nodeEnv, MODE: _mode, VITEST: _vitest, ...env } = process.env;
  await run('bun', ['--bun', 'node_modules/astro/bin/astro.mjs', 'build'], {
    cwd: project,
    env: { ...env, ASTRO_TELEMETRY_DISABLED: '1', FIXTURE_BUILD_ID: buildId, PUBLIC_GIT_COMMIT_ID: commit },
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
}

async function readOutput(project: string): Promise<Record<string, string>> {
  const dist = join(project, 'dist');
  const files = await listFiles(dist);
  const contents = await Promise.all(
    files.map(async (file): Promise<[string, string]> => [file, await readFile(join(dist, file), 'utf8')])
  );
  return Object.fromEntries(contents);
}

/** The content of the first `<p>` in an HTML page, or the whole body of any other route. */
function rendered(output: Record<string, string>, file: string): string | undefined {
  const content = output[file];
  return content?.match(/<p>(.*?)<\/p>/)?.[1] ?? content;
}

function expectSvgToResolve(output: Record<string, string>): void {
  const src = output['icons/logo/index.html']?.match(/src="\/([^"]+\.svg)"/)?.[1];
  expect(src).toBeDefined();
  expect(Object.keys(output)).toContain(src);
}

test('incremental builds reuse unchanged pages, invalidate changed inputs and prune removed paths', async () => {
  const project = await createProject();
  await writeDocument(project, 'alpha', 'alpha v1');
  await writeDocument(project, 'beta', 'beta v1');

  // Cold build: the SVG's callable image metadata has to cross the worker boundary.
  await build(project, 'cold');
  const cold = await readOutput(project);
  expect(rendered(cold, 'reference/alpha/index.html')).toBe('alpha v1|cold');
  expect(rendered(cold, 'reference/alpha.md')).toBe('alpha v1|cold');
  expect(rendered(cold, 'og/alpha.png')).toBe('alpha|cold');
  expectSvgToResolve(cold);

  // Warm build with unchanged inputs: the output is byte-for-byte the same.
  await build(project, 'warm');
  const warm = await readOutput(project);
  expect(warm).toEqual(cold);

  // A changed document re-renders its HTML and Markdown routes and nothing else.
  await writeDocument(project, 'alpha', 'alpha v2');
  await build(project, 'document');
  const document = await readOutput(project);
  expect(rendered(document, 'reference/alpha/index.html')).toBe('alpha v2|document');
  expect(rendered(document, 'reference/alpha.md')).toBe('alpha v2|document');
  expect(rendered(document, 'reference/beta/index.html')).toBe('beta v1|cold');
  expect(rendered(document, 'reference/beta.md')).toBe('beta v1|cold');
  expect(rendered(document, 'og/alpha.png')).toBe('alpha|cold');
  expectSvgToResolve(document);

  // A renderer asset is outside the module graph, so only the cache key reveals the change.
  await writeProjectFile(project, 'public/og-image.png', 'new background');
  await build(project, 'asset');
  const asset = await readOutput(project);
  expect(rendered(asset, 'og/alpha.png')).toBe('alpha|asset');
  expect(rendered(asset, 'og/beta.png')).toBe('beta|asset');
  expect(rendered(asset, 'reference/alpha/index.html')).toBe('alpha v2|document');

  // A new deployment re-renders API pages, whose markup carries its identity, but not social cards.
  await build(project, 'deployment', 'commit-b');
  const deployment = await readOutput(project);
  expect(rendered(deployment, 'reference/alpha/index.html')).toBe('alpha v2|deployment');
  expect(rendered(deployment, 'reference/beta.md')).toBe('beta v1|deployment');
  expect(rendered(deployment, 'og/alpha.png')).toBe('alpha|asset');

  // A removed document disappears from the output and from the page cache.
  await rm(join(project, 'data/beta.json'));
  await build(project, 'removed', 'commit-b');
  const removed = await readOutput(project);
  expect(Object.keys(removed).filter((file) => file.includes('beta'))).toEqual([]);
  expect(rendered(removed, 'reference/alpha/index.html')).toBe('alpha v2|deployment');
  expect(rendered(removed, 'og/alpha.png')).toBe('alpha|asset');
  expectSvgToResolve(removed);
  const cached = await listFiles(join(project, '.astro-cache'));
  expect(cached.filter((file) => file.includes('alpha')).length).toBeGreaterThan(0);
  expect(cached.filter((file) => file.includes('beta'))).toEqual([]);
}, 300_000);
