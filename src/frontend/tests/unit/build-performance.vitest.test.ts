import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { measureOutput, sampleCompression } from '../../scripts/measure-build-output.mjs';

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
  expect(job('frontend-gate')).toContain('needs: [build, validation, e2e, report]');
  expect(job('frontend-gate')).toContain('for result in "$BUILD" "$VALIDATION" "$E2E" "$REPORT"');
  expect(job('frontend-gate')).toContain('if [[ "$result" != "success" ]]');
  expect(job('frontend-gate')).toContain('exit 1');
  expect(job('report')).toContain('pattern: frontend-blob-report-*');
  expect(job('build')).toContain('name: frontend-dist');
  expect(job('build')).toContain('path: src/frontend/dist');
  expect(job('build')).toContain('./node_modules/astro/bin/astro.mjs build --mode production');
});
