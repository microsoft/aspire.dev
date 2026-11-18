import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const compress = promisify(gzip);

// Slightly above the measured main baseline (~9.8 GB of dist), so the budget
// reports without firing until the output grows. Override with
// DIST_SIZE_BUDGET_BYTES; set DIST_SIZE_BUDGET_MODE=error to fail the build.
export const DEFAULT_DIST_SIZE_BUDGET_BYTES = 10 * 1024 ** 3;

export function outputGroup(path) {
  if (path.startsWith('reference/api/')) return path.split('/').slice(0, 3).join('/');
  return path.includes('/') ? path.split('/')[0] : '(root)';
}

export function topLevelGroup(path) {
  return path.includes('/') ? path.split('/')[0] : '(root)';
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function groupFiles(files, keyOf) {
  /** @type {Map<string, { path: string, files: number, bytes: number, htmlFiles: number, markdownFiles: number }>} */
  const groups = new Map();
  for (const file of files) {
    const key = keyOf(file.path);
    const group = groups.get(key) ?? { path: key, files: 0, bytes: 0, htmlFiles: 0, markdownFiles: 0 };
    group.files++;
    group.bytes += file.bytes;
    if (file.path.endsWith('.html')) group.htmlFiles++;
    if (file.path.endsWith('.md')) group.markdownFiles++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
}

export async function measureOutput(directory) {
  /** @type {{ path: string, bytes: number }[]} */
  const files = [];
  // dist holds ~80k files: stat each directory's entries concurrently (libuv
  // bounds the real parallelism) instead of awaiting them one at a time.
  async function walk(relative = '') {
    const entries = await readdir(join(directory, relative), { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push({ path, bytes: (await stat(join(directory, path))).size });
    }));
  }
  await walk();
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const htmlSizes = files.filter((file) => file.path.endsWith('.html')).map((file) => file.bytes);
  return {
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    htmlFiles: htmlSizes.length,
    htmlBytes: htmlSizes.reduce((sum, bytes) => sum + bytes, 0),
    medianHtmlBytes: median(htmlSizes),
    groups: groupFiles(files, outputGroup),
    topLevel: groupFiles(files, topLevelGroup),
  };
}

export function readBudget(env = process.env) {
  const raw = env.DIST_SIZE_BUDGET_BYTES?.trim();
  const bytes = raw ? Number(raw) : DEFAULT_DIST_SIZE_BUDGET_BYTES;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error(`DIST_SIZE_BUDGET_BYTES must be a positive integer, got '${raw}'.`);
  }
  const mode = (env.DIST_SIZE_BUDGET_MODE?.trim() || 'warn').toLowerCase();
  if (mode !== 'warn' && mode !== 'error') {
    throw new Error(`DIST_SIZE_BUDGET_MODE must be 'warn' or 'error', got '${mode}'.`);
  }
  return { bytes, mode };
}

export function checkBudget(totalBytes, budget) {
  const exceeded = totalBytes > budget.bytes;
  const message = `dist is ${formatBytes(totalBytes)} (${totalBytes} bytes), ` +
    `${exceeded ? 'over' : 'within'} the ${formatBytes(budget.bytes)} budget (${budget.bytes} bytes).`;
  return {
    exceeded,
    message,
    annotation: exceeded ? `::${budget.mode === 'error' ? 'error' : 'warning'} title=Frontend dist size budget::${message}` : undefined,
    fail: exceeded && budget.mode === 'error',
  };
}

export function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function formatSizeReport(output, budget, result) {
  const row = (group) => `| \`${group.path}\` | ${formatBytes(group.bytes)} | ` +
    `${(group.bytes / (output.totalBytes || 1) * 100).toFixed(1)}% | ${group.files} | ${group.htmlFiles} |`;
  const apiGroups = output.groups.filter((group) => group.path.startsWith('reference/api/'));
  const header = ['| Directory | Size | Share | Files | HTML pages |', '| --- | ---: | ---: | ---: | ---: |'];
  return [
    '## Frontend dist size',
    '',
    `${result.exceeded ? (budget.mode === 'error' ? '❌' : '⚠️') : '✅'} ${result.message}`,
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Total size | ${formatBytes(output.totalBytes)} (${output.totalBytes} bytes) |`,
    `| HTML size | ${formatBytes(output.htmlBytes)} |`,
    `| Files | ${output.files.length} |`,
    `| HTML pages | ${output.htmlFiles} |`,
    `| Median HTML page | ${formatBytes(output.medianHtmlBytes)} |`,
    `| Budget (${budget.mode}) | ${formatBytes(budget.bytes)} |`,
    '',
    '<details><summary>Top-level directories (locale folders included)</summary>',
    '',
    ...header,
    ...output.topLevel.map(row),
    '',
    '</details>',
    '',
    ...(apiGroups.length ? [
      '<details><summary><code>reference/api</code> by language</summary>',
      '',
      ...header,
      ...apiGroups.map(row),
      '',
      '</details>',
      '',
    ] : []),
  ].join('\n');
}

export async function sampleCompression(directory, files) {
  // Stratify by output directory; cap this diagnostic so profiling doesn't re-compress dist.
  const selected = [];
  const counts = new Map();
  let bytes = 0;
  for (const file of files) {
    const group = outputGroup(file.path);
    if ((counts.get(group) ?? 0) >= 8 || file.bytes > 8 * 1024 * 1024 ||
        bytes + file.bytes > 32 * 1024 * 1024) continue;
    selected.push(file);
    counts.set(group, (counts.get(group) ?? 0) + 1);
    bytes += file.bytes;
  }
  const results = [];
  for (const level of [1, 6]) {
    let compressedBytes = 0;
    let compressionMs = 0;
    for (const file of selected) {
      const input = await readFile(join(directory, file.path));
      const start = performance.now();
      compressedBytes += (await compress(input, { level })).length;
      compressionMs += performance.now() - start;
    }
    results.push({ level, compressionMs, compressedBytes });
  }
  return { kind: 'bounded-per-file-gzip-sample-not-native-artifact', inputBytes: bytes, files: selected, results };
}

async function main() {
  const budget = readBudget();
  const output = await measureOutput(resolve('dist'));
  const result = checkBudget(output.totalBytes, budget);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, formatSizeReport(output, budget, result));
  }

  const out = process.env.BUILD_METRICS_DIR;
  if (out) {
    await mkdir(out, { recursive: true });
    const summary = {
      commit: process.env.GITHUB_SHA,
      run: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      node: process.version,
      runner: process.env.RUNNER_NAME,
      runnerImage: process.env.ImageVersion,
      contentCacheHit: process.env.ASTRO_CACHE_HIT === 'true',
      lockfileSha256: createHash('sha256').update(await readFile('bun.lock')).digest('hex'),
      fileCount: output.files.length,
      totalBytes: output.totalBytes,
      htmlFiles: output.htmlFiles,
      htmlBytes: output.htmlBytes,
      medianHtmlBytes: output.medianHtmlBytes,
      budget: { ...budget, exceeded: result.exceeded },
      topLevel: output.topLevel,
      directories: output.groups,
      largestFiles: [...output.files].sort((a, b) => b.bytes - a.bytes).slice(0, 20),
    };
    await writeFile(join(out, 'output.json'), JSON.stringify(summary, null, 2));
    if (process.env.PROFILE_BUILD === 'true') {
      await writeFile(join(out, 'file-manifest.json'), JSON.stringify(output.files));
      await writeFile(join(out, 'compression-sample.json'),
        JSON.stringify(await sampleCompression(resolve('dist'), output.files), null, 2));
    }
  }

  console.log(`[build-output] ${output.files.length} files, ${output.totalBytes} bytes, ` +
    `${output.htmlFiles} HTML pages (median ${output.medianHtmlBytes} bytes)`);
  if (result.annotation) console.log(result.annotation);
  if (result.fail) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}