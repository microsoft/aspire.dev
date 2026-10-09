import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test, vi } from 'vitest';
import { measureOutput, sampleCompression } from '../../scripts/measure-build-output.mjs';
import buildTiming from '../../config/build-timing.mjs';
import { compareManifests } from '../../scripts/compare-build-output.mjs';
import { createOutputNormalizer } from '../../scripts/normalize-build-output.mjs';

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
  expect(job('validation')).toContain('pnpm lint');
  expect(job('validation')).toContain('pnpm test:unit');
  expect(job('build')).not.toContain('pnpm test:unit');
  expect(job('e2e')).toMatch(/needs: build/);
  expect(job('e2e')).toContain('shard: [1, 2]');
  for (const project of ['desktop-chromium', 'tablet-chromium', 'mobile-chromium']) {
    expect(job('e2e')).toContain(project);
  }
  expect(job('e2e')).toContain('--shard=${{ matrix.shard }}/2');
  expect(job('e2e')).toContain('frontend-blob-report-${{ matrix.project }}-${{ matrix.shard }}');
  expect(job('e2e')).toContain('frontend-test-results-${{ matrix.project }}-${{ matrix.shard }}');
  expect(job('frontend-gate')).toContain('needs: [build, validation, e2e, report, benchmark]');
  expect(job('frontend-gate')).toContain('for result in "$BUILD" "$VALIDATION" "$E2E" "$REPORT"');
  expect(job('frontend-gate')).toContain('if [[ "$result" != "success" ]]');
  expect(job('frontend-gate')).toContain('exit 1');
  expect(job('report')).toContain('pattern: frontend-blob-report-*');
  expect(job('build')).toContain('name: frontend-dist');
  expect(job('build')).toContain('path: src/frontend/dist');
  expect(job('build')).toContain('./node_modules/astro/bin/astro.mjs build --mode production');
});

test('CPU, timing, output inventories and diagnostic uploads are opt-in only', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const caller = await readFile(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  expect(workflow).toMatch(/profile_build:\n\s+description:.*\n\s+required: false\n\s+default: false/);
  expect(caller).toContain("contains(github.event.pull_request.labels.*.name, 'build-profile')");
  expect(workflow).toContain("BUILD_TIMING: ${{ inputs.profile_build && '1' || '0' }}");
  expect(workflow).toMatch(/if \[\[ "\$PROFILE_BUILD" == "true" \]\]; then\n\s+mkdir -p/);
  expect(workflow).toMatch(/else\n\s+pnpm build:production\n\s+fi/);
  expect(workflow).toContain('name: Measure frontend output\n        if: ${{ inputs.profile_build }}');
  expect(workflow).toContain('name: Upload build diagnostics\n        if: ${{ always() && inputs.profile_build }}');
});

test('Astro build source does not receive workflow credentials', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const buildStep = workflow.match(/- name: Build frontend\n([\s\S]*?)(?=\n {6}- name:)/)?.[1];
  expect(buildStep).toBeDefined();
  expect(buildStep).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|github\.token|secrets\./);
  expect(workflow).toMatch(/fetch-depth: 0\n\s+persist-credentials: false/);
});

test('comparison profiles exact base and head with equivalent cold-cache settings', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-performance.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  expect(workflow).toContain("contains(github.event.pull_request.labels.*.name, 'build-profile')");
  expect(workflow).toContain('types: [opened, reopened, synchronize, labeled]');
  expect(workflow).toContain('variant: [baseline, candidate]');
  expect(workflow).toContain("matrix.variant == 'baseline' && github.event.pull_request.base.sha || github.event.pull_request.head.sha");
  expect(workflow).toContain('fetch-depth: 0\n          persist-credentials: false');
  expect(workflow).not.toContain('uses: actions/cache');
  expect(workflow).toMatch(/ASPIRE_BUILD_CONCURRENCY: ['"]4['"]/);
  expect(workflow).toContain('./node_modules/astro/bin/astro.mjs build --mode production');
  expect(workflow).toContain('git rev-parse HEAD > "$RUNNER_TEMP/frontend-performance/commit.txt"');
  expect(workflow).toContain('name: frontend-performance-${{ matrix.variant }}');
  expect(workflow).toContain('if-no-files-found: error');
  const buildStep = workflow.match(/- name: Profile production build\n([\s\S]*?)(?=\n {6}- name:)/)?.[1];
  expect(buildStep).toBeDefined();
  expect(buildStep).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|github\.token|secrets\./);
});

test('all frontend workflow checkouts disable persisted credentials', async () => {
  const workflow = (await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const checkouts = workflow.split(/\n {6}- /).filter((step) => step.startsWith('uses: actions/checkout@'));
  expect(checkouts).toHaveLength(5);
  for (const checkout of checkouts) {
    expect(checkout).toContain('\n          persist-credentials: false');
  }
  expect(checkouts.filter((checkout) => checkout.includes('ref: ${{ inputs.build_ref || github.sha }}'))).toHaveLength(4);
});

test('manual profiling keeps complete validation and uses the actual source commit', async () => {
  const workflow = await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8');
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toContain('Exact source ref for an independent baseline build');
  expect(workflow).toContain('BUILD_TIMING_LABEL: ${{ inputs.build_ref || github.sha }}');
  expect(workflow).toMatch(/name: Cache Astro content layer\r?\n\s+if: \$\{\{ !inputs\.cold_cache \}\}/);
  expect(workflow).toContain('ASPIRE_BUILD_CONCURRENCY: ${{ inputs.build_concurrency }}');
  expect(workflow).toContain('options: ["1", "2", "4", "8"]');
  expect(workflow).toContain('GITHUB_SHA="$(git rev-parse HEAD)" node scripts/measure-build-output.mjs');
  expect(workflow).toContain('needs: [build, validation, e2e, report, benchmark]');
});

test('requested same-runner comparison uses exact commits, fresh content caches, and gates failures', async () => {
  const workflow = await readFile(new URL('../../../../.github/workflows/frontend-build.yml', import.meta.url), 'utf8');
  expect(workflow).toContain("inputs.profile_build && inputs.comparison_ref != ''");
  expect(workflow).toContain('for label in baseline-before candidate baseline-after; do');
  expect(workflow).toContain('git checkout --detach "$ref"');
  expect(workflow).toContain('rm -rf -- "$GITHUB_WORKSPACE/src/frontend/node_modules/.astro"');
  expect(workflow).toContain("BUILD_METRICS_HASH_CONTENTS: '1'");
  expect(workflow).toContain('node "$output/compare-build-output.mjs"');
  expect(workflow).toContain('BENCHMARK: ${{ needs.benchmark.result }}');
  expect(workflow).toContain('"$BENCHMARK" != "success" && "$BENCHMARK" != "skipped"');
  expect(workflow).toContain('export NODE_OPTIONS="--max-old-space-size=8192"');
  expect(workflow).not.toContain('--max-semi-space-size');
});

test('content hashes detect equal-length differences instead of accepting inventories alone', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aspire-output-hashes-'));
  directories.push(directory);
  await writeFile(join(directory, 'index.html'), 'aaaa');
  const before = await measureOutput(directory, { hashContents: true });
  await writeFile(join(directory, 'index.html'), 'bbbb');
  const after = await measureOutput(directory, { hashContents: true });
  expect(before.files[0].bytes).toBe(after.files[0].bytes);
  expect(compareManifests(before.files, before.files)).toEqual({ removed: [], added: [], changed: [] });
  expect(compareManifests(before.files, after.files)).toEqual({ removed: [], added: [], changed: ['index.html'] });
  expect(compareManifests(before.files, [])).toEqual({ removed: ['index.html'], added: [], changed: [] });
  expect(compareManifests([], after.files)).toEqual({ removed: [], added: ['index.html'], changed: [] });
  expect(() => compareManifests([{ path: 'index.html', bytes: 4 }], after.files)).toThrow('SHA-256');
  expect(() => compareManifests([...before.files, ...before.files], after.files)).toThrow('Duplicate output path');
});

test('media normalization preserves group identity and all unrelated content', async () => {
  const normalizer = await createOutputNormalizer(fileURLToPath(new URL('../..', import.meta.url)));
  const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const render = (id: string, text = 'Keep', buttonId = id) =>
    `<html><body><div data-looping-image-id="${id}"><img data-looping-image-id="${id}"><button data-looping-image-id="${buttonId}">${text}</button></div></body></html>`;
  const before = normalizer.normalize('example.html', render(first));
  expect(normalizer.normalize('example.html', render(second))).toEqual(before);
  expect(normalizer.normalize('example.html', render(second, 'Changed')).content).not.toBe(before.content);
  expect(normalizer.normalize('example.html', render(second, 'Keep', first)).content).not.toBe(before.content);
  const script = `<html><body><script>const id="${first}";</script></body></html>`;
  expect(normalizer.normalize('example.html', script)).toEqual({ content: script, rules: [] });
});

test('Pagefind normalization retains values and array ordering', async () => {
  const normalizer = await createOutputNormalizer(fileURLToPath(new URL('../..', import.meta.url)));
  const normalize = (value: unknown) => normalizer.normalize('pagefind/pagefind-entry.json', JSON.stringify(value)).content;
  const languages = { en: { hash: 'en-a', page_count: 1 }, fr: { hash: 'fr-b', page_count: 1 } };
  expect(normalize({ version: '1.5.2', languages })).toBe(normalize({ languages: { fr: languages.fr, en: languages.en }, version: '1.5.2' }));
  expect(normalize({ languages })).not.toBe(normalize({ languages: { ...languages, en: { hash: 'en-a', page_count: 2 } } }));
  expect(normalize({ include_characters: ['_', '-'] })).not.toBe(normalize({ include_characters: ['-', '_'] }));
});

test('RSS normalization changes only generated times and protects authored dates and text', async () => {
  const start = Date.parse('2026-10-09T10:00:00Z');
  const end = Date.parse('2026-10-09T11:00:00Z');
  const authored = Date.parse('2026-10-09T10:40:00Z');
  const normalizer = await createOutputNormalizer(fileURLToPath(new URL('../..', import.meta.url)), {
    buildWindow: { start, end }, authoredDates: new Set([authored]),
  });
  const render = (generated: string, author = new Date(authored).toUTCString(), title = 'Keep') =>
    `<rss><channel><item><title>${title}</title><pubDate>${generated}</pubDate><description><![CDATA[<pubDate>${generated}</pubDate>]]></description></item><item><pubDate>${author}</pubDate></item></channel></rss>`;
  const time = new Date(start + 60_000).toUTCString();
  const first = normalizer.normalize('rss.xml', render(time));
  expect(first.content).toContain('GENERATED_PUBLICATION_TIME');
  expect(first.content).toContain(new Date(authored).toUTCString());
  expect(first.content).toContain(`<pubDate>${time}</pubDate>`);
  expect(normalizer.normalize('rss.xml', render(time, new Date(authored + 60_000).toUTCString())).content).not.toBe(first.content);
  expect(normalizer.normalize('rss.xml', render(time, undefined, 'Changed')).content).not.toBe(first.content);
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
