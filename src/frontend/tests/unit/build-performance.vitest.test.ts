import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  checkBudget,
  DEFAULT_DIST_SIZE_BUDGET_BYTES,
  formatSizeReport,
  measureOutput,
  readBudget,
  sampleCompression,
} from '../../scripts/measure-build-output.mjs';
import buildTiming from '../../config/build-timing.mjs';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test('output metrics preserve native paths and separate API languages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aspire-output-metrics-'));
  directories.push(directory);
  await mkdir(join(directory, 'reference', 'api', 'typescript'), { recursive: true });
  await writeFile(join(directory, 'index.html'), 'home');
  await writeFile(join(directory, 'reference', 'api', 'typescript', 'index.html'), 'typescript');
  const output = await measureOutput(directory);
  expect(output.totalBytes).toBe(14);
  expect(output.files).toEqual([
    { path: 'index.html', bytes: 4 },
    { path: 'reference/api/typescript/index.html', bytes: 10 },
  ]);
  expect(output.groups).toEqual([
    { path: 'reference/api/typescript', files: 1, bytes: 10, htmlFiles: 1, markdownFiles: 0 },
    { path: '(root)', files: 1, bytes: 4, htmlFiles: 1, markdownFiles: 0 },
  ]);
  const sample = await sampleCompression(directory, output.files);
  expect(sample.inputBytes).toBe(14);
  expect(sample.results.map(({ level }) => level)).toEqual([1, 6]);
  expect(sample.results.every(({ compressedBytes }) => compressedBytes > 0)).toBe(true);
});

test('output counts distinguish markdown and HTML without parsing interleaved logs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aspire-output-counts-'));
  directories.push(directory);
  await mkdir(join(directory, 'reference', 'api', 'csharp'), { recursive: true });
  await writeFile(join(directory, 'reference', 'api', 'csharp', 'type.md'), 'api');
  await writeFile(join(directory, 'reference', 'api', 'csharp', 'index.html'), 'html');
  await writeFile(join(directory, 'reference', 'api', 'csharp', 'search.json'), '{}');
  expect((await measureOutput(directory)).groups).toEqual([
    { path: 'reference/api/csharp', files: 3, bytes: 9, htmlFiles: 1, markdownFiles: 1 },
  ]);
});

test('frontend workflow keeps validation parallel and every shard required', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const job = (name: string) => workflow.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`))?.[1] ?? '';
  expect(job('validation')).not.toMatch(/^\s+needs:/m);
  expect(job('validation')).toContain('bun run lint');
  expect(job('validation')).toContain('bun run test:unit');
  expect(job('build')).not.toContain('bun run test:unit');
  expect(job('e2e')).toMatch(/needs: build/);
  expect(job('e2e')).toContain('shard: [1, 2]');
  for (const project of ['desktop-chromium', 'tablet-chromium', 'mobile-chromium']) {
    expect(job('e2e')).toContain(project);
  }
  expect(job('e2e')).toContain('--shard=${{ matrix.shard }}/2');
  expect(job('e2e')).toContain('frontend-blob-report-${{ matrix.project }}-${{ matrix.shard }}');
  expect(job('e2e')).toContain('frontend-test-results-${{ matrix.project }}-${{ matrix.shard }}');
  expect(job('frontend-gate')).toContain('needs: [build, browsable-artifact, validation, e2e, report]');
  expect(job('frontend-gate')).toContain('for result in "$BUILD" "$BROWSABLE_ARTIFACT" "$VALIDATION" "$E2E" "$REPORT"');
  expect(job('frontend-gate')).toContain('if [[ "$result" != "success" ]]');
  expect(job('frontend-gate')).toContain('exit 1');
  expect(job('report')).toContain('pattern: frontend-blob-report-*');
  // The shards get the site as one zstd tar; the browsable many-file
  // artifact is uploaded alongside them, not before them.
  expect(job('build')).toContain('zstd -3 -T0');
  expect(job('build')).toContain('name: frontend-site');
  expect(job('build')).not.toContain('name: frontend-dist');
  expect(job('e2e')).toContain('name: frontend-site');
  expect(job('e2e')).not.toContain('frontend-dist');
  expect(job('browsable-artifact')).toMatch(/needs: build/);
  // Still runs after a failed build that packed the site, for debugging.
  expect(job('browsable-artifact')).toContain("if: ${{ !cancelled() && needs.build.outputs.site_archive_uploaded == 'true' }}");
  expect(job('browsable-artifact')).toContain('name: frontend-dist');
  expect(job('browsable-artifact')).toContain('Upsert PR artifact comment');
  expect(job('build')).toContain('./node_modules/astro/bin/astro.mjs build --mode production');
});

test('build job restores Astro incremental state keyed on the Bun lockfile and saves it sparingly', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const step = (name: string) => workflow.match(new RegExp(`- name: ${name}\\n([\\s\\S]*?)(?=\\n {6}- name:)`))?.[1];
  const restoreStep = step('Restore Astro build state');
  expect(restoreStep).toBeDefined();
  expect(restoreStep).toContain('uses: actions/cache/restore@');
  expect(restoreStep).toContain('path: src/frontend/node_modules/.astro');
  expect(restoreStep).toContain("hashFiles('src/frontend/bun.lock', 'src/frontend/astro.config.mjs', 'src/frontend/patches/*.patch')");
  expect(restoreStep).toContain('-${{ github.sha }}');
  expect(restoreStep).toMatch(/restore-keys: \|\n\s+astro-build-\$\{\{ runner\.os \}\}-/);
  const saveStep = step('Save Astro build state');
  expect(saveStep).toBeDefined();
  expect(saveStep).toContain('uses: actions/cache/save@');
  expect(saveStep).toContain('path: src/frontend/node_modules/.astro');
  expect(saveStep).toContain('key: ${{ steps.astro_cache.outputs.cache-primary-key }}');
  expect(saveStep).toContain("if: ${{ success() && (github.event_name == 'push' || steps.astro_cache.outputs.cache-matched-key == '') }}");
});

test('CPU, timing, output inventories and diagnostic uploads are opt-in only', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const caller = await readFile(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  expect(workflow).toMatch(/profile_build:\n\s+description:.*\n\s+required: false\n\s+default: false/);
  expect(caller).toContain("contains(github.event.pull_request.labels.*.name, 'build-profile')");
  expect(workflow).toContain("BUILD_TIMING: ${{ inputs.profile_build && '1' || '0' }}");
  expect(workflow).toMatch(/if \[\[ "\$PROFILE_BUILD" == "true" \]\]; then\n\s+mkdir -p/);
  expect(workflow).toMatch(/else\n\s+bun run build:production\n\s+fi/);
  expect(workflow).toContain('name: Upload build diagnostics\n        if: ${{ always() && inputs.profile_build }}');
});

test('every build measures dist against a configurable size budget', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const measureStep = workflow.match(/- name: Measure frontend output\n([\s\S]*?)(?=\n {6}- name:)/)?.[1];
  expect(measureStep).toBeDefined();
  expect(measureStep).toContain("if: ${{ !cancelled() && hashFiles('src/frontend/dist/index.html') != '' }}");
  expect(measureStep).toContain('DIST_SIZE_BUDGET_BYTES: ${{ vars.FRONTEND_DIST_BUDGET_BYTES }}');
  expect(measureStep).toContain('DIST_SIZE_BUDGET_MODE: ${{ vars.FRONTEND_DIST_BUDGET_MODE }}');
});

test('size report covers HTML, top-level and API directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aspire-output-report-'));
  directories.push(directory);
  await mkdir(join(directory, 'ja', 'get-started'), { recursive: true });
  await mkdir(join(directory, 'reference', 'api', 'csharp'), { recursive: true });
  await writeFile(join(directory, 'index.html'), 'a'.repeat(10));
  await writeFile(join(directory, 'ja', 'get-started', 'index.html'), 'a'.repeat(30));
  await writeFile(join(directory, 'reference', 'api', 'csharp', 'index.html'), 'a'.repeat(100));
  await writeFile(join(directory, 'reference', 'api', 'csharp', 'type.md'), 'a'.repeat(5));
  await writeFile(join(directory, 'reference', 'index.html'), 'a'.repeat(20));
  const output = await measureOutput(directory);
  expect(output).toMatchObject({ totalBytes: 165, htmlFiles: 4, htmlBytes: 160, medianHtmlBytes: 25 });
  expect(output.topLevel.map(({ path, bytes }) => [path, bytes])).toEqual([
    ['reference', 125], ['ja', 30], ['(root)', 10],
  ]);
  const budget = readBudget({});
  const report = formatSizeReport(output, budget, checkBudget(output.totalBytes, budget));
  expect(report).toContain('| HTML pages | 4 |');
  expect(report).toContain('| Median HTML page | 25 B |');
  expect(report).toContain('| `ja` | 30 B | 18.2% | 1 | 1 |');
  expect(report).toContain('| `reference/api/csharp` | 105 B |');
});

test('size budget defaults to warning and can be switched to a hard failure', () => {
  expect(readBudget({})).toEqual({ bytes: DEFAULT_DIST_SIZE_BUDGET_BYTES, mode: 'warn' });
  expect(readBudget({ DIST_SIZE_BUDGET_BYTES: '', DIST_SIZE_BUDGET_MODE: '' }).mode).toBe('warn');
  expect(() => readBudget({ DIST_SIZE_BUDGET_BYTES: '10GB' })).toThrow(/positive integer/);
  expect(() => readBudget({ DIST_SIZE_BUDGET_MODE: 'fail' })).toThrow(/'warn' or 'error'/);

  expect(checkBudget(100, { bytes: 100, mode: 'warn' })).toMatchObject({ exceeded: false, fail: false, annotation: undefined });
  const warn = checkBudget(101, { bytes: 100, mode: 'warn' });
  expect(warn).toMatchObject({ exceeded: true, fail: false });
  expect(warn.annotation).toMatch(/^::warning title=Frontend dist size budget::/);
  const error = checkBudget(101, readBudget({ DIST_SIZE_BUDGET_BYTES: '100', DIST_SIZE_BUDGET_MODE: 'error' }));
  expect(error).toMatchObject({ exceeded: true, fail: true });
  expect(error.annotation).toMatch(/^::error /);
});

test('Astro build source does not receive workflow credentials', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const buildStep = workflow.match(/- name: Build frontend\n([\s\S]*?)(?=\n {6}- name:)/)?.[1];
  expect(buildStep).toBeDefined();
  expect(buildStep).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|github\.token|secrets\./);
  expect(workflow).toMatch(/fetch-depth: 0\n\s+persist-credentials: false/);
});

test('all frontend workflow checkouts disable persisted credentials', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const checkouts = workflow.split(/\n {6}- /).filter((step) => step.startsWith('uses: actions/checkout@'));
  expect(checkouts).toHaveLength(4);
  for (const checkout of checkouts) {
    expect(checkout).toContain('\n          persist-credentials: false');
  }
});

test('timing reports distinguish generated pages from asset URLs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aspire-timing-report-'));
  directories.push(directory);
  const output = join(directory, 'timing.jsonl');
  vi.stubEnv('BUILD_TIMING_OUT', output);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const hooks = buildTiming().hooks;
  const start = hooks['astro:build:start'];
  const done = hooks['astro:build:done'];
  if (!start || !done) throw new Error('Expected build timing lifecycle hooks.');
  Reflect.apply(start, undefined, [{}]);
  Reflect.apply(done, undefined, [{
    pages: [{ pathname: '/one/' }, { pathname: '/two/' }],
    assets: new Map([
      ['one', [new URL('file:///one.css'), new URL('file:///one.js')]],
      ['two', [new URL('file:///two.js')]],
    ]),
  }]);
  const report: unknown = JSON.parse(await readFile(output, 'utf8'));
  expect(report).toMatchObject({
    kind: 'final',
    meta: { pagesGenerated: 2, assetsTotal: 3 },
  });
  expect(report).not.toHaveProperty('meta.routesTotal');
  expect(log).toHaveBeenCalledWith('[build-timing]   pages=2  assets=3');
});
