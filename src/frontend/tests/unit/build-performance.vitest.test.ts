import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { measureOutput, measureRoutes, sampleCompression } from '../../scripts/measure-build-output.mjs';

const directories: string[] = [];
afterEach(async () => {
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
    { path: 'reference/api/typescript', files: 1, bytes: 10 },
    { path: '(root)', files: 1, bytes: 4 },
  ]);
  const sample = await sampleCompression(directory, output.files);
  expect(sample.inputBytes).toBe(14);
  expect(sample.results.map(({ level }) => level)).toEqual([1, 6]);
  expect(sample.results.every(({ compressedBytes }) => compressedBytes > 0)).toBe(true);
});

test('route metrics label overlapping work and retain milliseconds', () => {
  const routes = measureRoutes([
    '\u001b[2m23:59:59\u001b[22m   ├─ /reference/api/typescript/module/index.html (+1.2s)',
    '00:00:01   ├─ /reference/api/typescript/module/type/index.html (+23ms)',
    '00:00:02   └─ /reference/api/typescript/module.md (+2ms)',
    '00:00:03 [build] complete',
  ].join('\n'));
  expect(routes).toEqual([
    {
      group: 'reference/api/typescript (html/assets)',
      count: 2, summedRenderMs: 1223, firstCompletion: '23:59:59', lastCompletion: '00:00:01',
    },
    {
      group: 'reference/api/typescript (markdown)',
      count: 1, summedRenderMs: 2, firstCompletion: '00:00:02', lastCompletion: '00:00:02',
    },
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
  expect(job('frontend-gate')).toContain('needs: [build, validation, e2e, report]');
  expect(job('frontend-gate')).toContain('for result in "$BUILD" "$VALIDATION" "$E2E" "$REPORT"');
  expect(job('frontend-gate')).toContain('if [[ "$result" != "success" ]]');
  expect(job('frontend-gate')).toContain('exit 1');
  expect(job('report')).toContain('pattern: frontend-blob-report-*');
  expect(job('build')).toContain('name: frontend-dist');
  expect(job('build')).toContain('path: src/frontend/dist');
  expect(job('build')).toContain('./node_modules/astro/bin/astro.mjs build --mode production');
});
