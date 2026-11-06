import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function summarizeComparison(baseline, candidate) {
  const rows = [
    ['Build command (seconds)', baseline.wallSeconds, candidate.wallSeconds],
    ['Build phases (seconds)', baseline.timing.totalWallMs / 1000, candidate.timing.totalWallMs / 1000],
    ['Peak RSS (MiB)', baseline.peakRssKiB / 1024, candidate.peakRssKiB / 1024],
    ['All output (MiB)', baseline.output.totalBytes / 1024 ** 2, candidate.output.totalBytes / 1024 ** 2],
    ['HTML output (MiB)', size(baseline, '.html') / 1024 ** 2, size(candidate, '.html') / 1024 ** 2],
    ['JavaScript output (MiB)', size(baseline, '.js') / 1024 ** 2, size(candidate, '.js') / 1024 ** 2],
    ['HTML files', count(baseline, '.html'), count(candidate, '.html')],
  ];
  return [
    '## Mermaid build-time comparison',
    '',
    `Baseline: \`${baseline.output.commit}\`. Candidate: \`${candidate.output.commit}\`.`,
    '',
    '| Measurement | Baseline | Pele | Delta | Change |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows.map(([name, before, after]) =>
      `| ${name} | ${before.toFixed(2)} | ${after.toFixed(2)} | ${(after - before).toFixed(2)} | ${before === 0 ? 'N/A' : `${((after / before - 1) * 100).toFixed(1)}%`} |`),
    '',
    'One cold production build per ref, sequentially on the same runner, using Bun and each ref’s frozen lockfile. The candidate is the synthetic PR merge, so both variants include the exact base content. No Astro cache is restored; dependency installation is excluded.',
    'This is a directional baseline, not a statistically significant benchmark. Run order and OS caches can affect the result. HTML/JavaScript sizes are uncompressed build output, not measured browser transfer sizes.',
    'Build phases are measured by the existing Astro timing integration; resource logs also capture the complete build command. Invalid diagrams now fail page generation rather than showing a browser-only error.',
    '',
  ].join('\n');
}

function size(result, extension) {
  return result.files.filter((file) => file.path.endsWith(extension)).reduce((sum, file) => sum + file.bytes, 0);
}

function count(result, extension) {
  return result.files.filter((file) => file.path.endsWith(extension)).length;
}

async function load(directory) {
  const read = (file) => readFile(join(directory, file), 'utf8');
  const reports = (await read('timing.jsonl')).trim().split('\n').map((line) => JSON.parse(line));
  const timing = reports.findLast((report) => report.kind === 'final');
  if (!timing) throw new Error(`Missing final build timing in ${directory}`);
  const resources = await read('resources.txt');
  const peakRss = /Maximum resident set size \(kbytes\):\s*(\d+)/.exec(resources);
  if (!peakRss) throw new Error(`Missing peak RSS in ${directory}`);
  const elapsed = /Elapsed \(wall clock\) time .*:\s+([\d:.]+)/.exec(resources);
  if (!elapsed) throw new Error(`Missing build elapsed time in ${directory}`);
  return {
    timing,
    wallSeconds: elapsed[1].split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0),
    peakRssKiB: Number(peakRss[1]),
    output: JSON.parse(await read('output.json')),
    files: JSON.parse(await read('file-manifest.json')),
  };
}

async function main() {
  const directory = process.env.COMPARISON_DIR;
  if (!directory) throw new Error('COMPARISON_DIR is required.');
  const [baseline, candidate] = await Promise.all(['baseline', 'candidate'].map((name) => load(join(directory, name))));
  const summary = summarizeComparison(baseline, candidate);
  await writeFile(join(directory, 'comparison.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
