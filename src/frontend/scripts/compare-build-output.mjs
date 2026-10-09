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
    if (file.semanticSha256 !== undefined &&
        (typeof file.semanticSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.semanticSha256) || !Number.isSafeInteger(file.semanticBytes) || file.semanticBytes < 0 ||
         !Array.isArray(file.normalizations) || file.normalizations.length === 0)) {
      throw new Error('Semantic fingerprints require valid hashes, sizes, and an explicit normalization audit.');
    }
    if (file.normalizations?.some((rule) =>
      !((rule === 'looping-media-instance-identities' && file.path.endsWith('.html')) ||
        (rule === 'rss-generated-publication-times' && file.path === 'rss.xml') ||
        (rule === 'pagefind-json-object-order' && file.path === 'pagefind/pagefind-entry.json')))) {
      throw new Error(`Unsupported output normalization: ${file.path}`);
    }
    index.set(file.path, file);
  }
  return index;
}

export function compareManifests(referenceFiles, candidateFiles, { semantic = true } = {}) {
  const reference = indexManifest(referenceFiles);
  const candidate = indexManifest(candidateFiles);
  return {
    removed: [...reference.keys()].filter((path) => !candidate.has(path)),
    added: [...candidate.keys()].filter((path) => !reference.has(path)),
    changed: [...reference.keys()].filter((path) => candidate.has(path) &&
      ((semantic ? reference.get(path).semanticBytes ?? reference.get(path).bytes : reference.get(path).bytes) !==
       (semantic ? candidate.get(path).semanticBytes ?? candidate.get(path).bytes : candidate.get(path).bytes) ||
       (semantic ? reference.get(path).semanticSha256 ?? reference.get(path).sha256 : reference.get(path).sha256) !==
       (semantic ? candidate.get(path).semanticSha256 ?? candidate.get(path).sha256 : candidate.get(path).sha256))),
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
  const rawComparisons = {};
  const timings = {};
  let different = false;
  for (const label of ['baseline-before', 'candidate', 'baseline-after']) {
    const reports = (await readFile(join(directory, label, 'timing.jsonl'), 'utf8'))
      .trim().split('\n').map((line) => JSON.parse(line));
    const final = reports.findLast((report) => report.kind === 'final');
    if (!final) throw new Error(`Missing final build timing: ${label}`);
    timings[label] = final.totalWallMs;
    if (label === 'baseline-before') continue;
    const manifest = await load(label, 'file-manifest.json');
    comparisons[label] = compareManifests(baseline, manifest);
    rawComparisons[label] = compareManifests(baseline, manifest, { semantic: false });
    const counts = Object.fromEntries(
      Object.entries(comparisons[label]).map(([key, paths]) => [key, paths.length]),
    );
    console.log(`[build-comparison] ${label}: ${JSON.stringify(counts)}`);
    different ||= Object.values(counts).some((count) => count > 0);
  }
  await writeFile(join(directory, 'comparison.json'),
    JSON.stringify({ timings, comparisons, rawComparisons }, null, 2));
  if (different) throw new Error('Build output differs; inspect comparison.json before accepting an optimization.');
  console.log(`[build-comparison] Equivalent output with audited generated metadata. Timings: ${JSON.stringify(timings)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
