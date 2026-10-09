import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function indexManifest(files) {
  if (!Array.isArray(files)) throw new Error('An output manifest must be an array.');
  const index = new Map();
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || !file.path ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
        typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error('Output comparisons require paths, byte counts, and SHA-256 content hashes.');
    }
    if (index.has(file.path)) throw new Error(`Duplicate output path: ${file.path}`);
    index.set(file.path, file);
  }
  return index;
}

export function compareManifests(referenceFiles, candidateFiles) {
  const reference = indexManifest(referenceFiles);
  const candidate = indexManifest(candidateFiles);
  return {
    removed: [...reference.keys()].filter((path) => !candidate.has(path)),
    added: [...candidate.keys()].filter((path) => !reference.has(path)),
    changed: [...reference.keys()].filter((path) => candidate.has(path) &&
      (reference.get(path).bytes !== candidate.get(path).bytes ||
       reference.get(path).sha256 !== candidate.get(path).sha256)),
  };
}

async function main() {
  const directory = process.env.BUILD_COMPARISON_DIR;
  if (!directory) throw new Error('BUILD_COMPARISON_DIR is required.');
  const load = async (label, filename) => JSON.parse(
    await readFile(join(directory, label, filename), 'utf8'),
  );
  const baseline = await load('baseline-before', 'file-manifest.json');
  const comparisons = {};
  const timings = {};
  let different = false;
  for (const label of ['baseline-before', 'candidate', 'baseline-after']) {
    const reports = (await readFile(join(directory, label, 'timing.jsonl'), 'utf8'))
      .trim().split('\n').map((line) => JSON.parse(line));
    const final = reports.findLast((report) => report.kind === 'final');
    if (!final) throw new Error(`Missing final build timing: ${label}`);
    timings[label] = final.totalWallMs;
    if (label === 'baseline-before') continue;
    comparisons[label] = compareManifests(baseline, await load(label, 'file-manifest.json'));
    const counts = Object.fromEntries(
      Object.entries(comparisons[label]).map(([key, paths]) => [key, paths.length]),
    );
    console.log(`[build-comparison] ${label}: ${JSON.stringify(counts)}`);
    different ||= Object.values(counts).some((count) => count > 0);
  }
  await writeFile(join(directory, 'comparison.json'),
    JSON.stringify({ timings, comparisons }, null, 2));
  if (different) throw new Error('Build output differs; inspect comparison.json before accepting an optimization.');
  console.log(`[build-comparison] Byte-identical output across all builds. Timings: ${JSON.stringify(timings)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
