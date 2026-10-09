import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const compress = promisify(gzip);

export function outputGroup(path) {
  if (path.startsWith('reference/api/')) return path.split('/').slice(0, 3).join('/');
  return path.includes('/') ? path.split('/')[0] : '(root)';
}

export async function measureOutput(directory, { hashContents = false } = {}) {
  /** @type {{ path: string, bytes: number, sha256?: string }[]} */
  const files = [];
  async function walk(relative = '') {
    const entries = await readdir(join(directory, relative), { withFileTypes: true });
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const file = { path, bytes: (await stat(join(directory, path))).size };
        if (hashContents) {
          const hash = createHash('sha256');
          for await (const chunk of createReadStream(join(directory, path))) hash.update(chunk);
          files.push({ ...file, sha256: hash.digest('hex') });
        } else {
          files.push(file);
        }
      }
    }
  }
  await walk();
  files.sort((a, b) => a.path.localeCompare(b.path));
  /** @type {Map<string, { path: string, files: number, bytes: number, htmlFiles: number, markdownFiles: number }>} */
  const groups = new Map();
  for (const file of files) {
    const key = outputGroup(file.path);
    const group = groups.get(key) ?? { path: key, files: 0, bytes: 0, htmlFiles: 0, markdownFiles: 0 };
    group.files++;
    group.bytes += file.bytes;
    if (file.path.endsWith('.html')) group.htmlFiles++;
    if (file.path.endsWith('.md')) group.markdownFiles++;
    groups.set(key, group);
  }
  return {
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    groups: [...groups.values()].sort((a, b) => b.bytes - a.bytes),
  };
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
  const out = process.env.BUILD_METRICS_DIR;
  if (!out) throw new Error('BUILD_METRICS_DIR is required.');
  await mkdir(out, { recursive: true });
  const output = await measureOutput(resolve('dist'), {
    hashContents: process.env.BUILD_METRICS_HASH_CONTENTS === '1',
  });
  const summary = {
    commit: process.env.GITHUB_SHA,
    run: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    node: process.version,
    runner: process.env.RUNNER_NAME,
    runnerImage: process.env.ImageVersion,
    contentCacheHit: process.env.ASTRO_CACHE_HIT === 'true',
    lockfileSha256: createHash('sha256').update(await readFile('pnpm-lock.yaml')).digest('hex'),
    fileCount: output.files.length,
    totalBytes: output.totalBytes,
    directories: output.groups,
    largestFiles: [...output.files].sort((a, b) => b.bytes - a.bytes).slice(0, 20),
  };
  await writeFile(join(out, 'output.json'), JSON.stringify(summary, null, 2));
  await writeFile(join(out, 'file-manifest.json'), JSON.stringify(output.files));
  if (process.env.PROFILE_BUILD === 'true') {
    await writeFile(join(out, 'compression-sample.json'),
      JSON.stringify(await sampleCompression(resolve('dist'), output.files), null, 2));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## Frontend build measurements',
      '',
      `- ${summary.fileCount} output files; ${(summary.totalBytes / 1024 / 1024).toFixed(1)} MiB before artifact compression.`,
      '- Phase timing, HTML/Markdown counts, largest directories/files, and output manifest: `frontend-performance` artifact.',
      '- Concurrent Astro route logs can interleave paths and durations; they are not used for timing attribution.',
      '',
    ].join('\n'));
  }
  console.log(`[build-output] ${summary.fileCount} files, ${summary.totalBytes} bytes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
