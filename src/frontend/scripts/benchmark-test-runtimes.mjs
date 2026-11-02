import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const output = resolve(process.env.BENCHMARK_OUT ?? '.runtime-benchmark');
await mkdir(output, { recursive: true });

async function run(name, executable, args, round) {
  const start = performance.now();
  const child = spawn(executable, args, {
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  const code = await new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('close', accept);
  });
  const result = { name, round, code, milliseconds: performance.now() - start };
  await writeFile(join(output, `${name}-${round}.log`), log);
  console.log(JSON.stringify(result));
  return result;
}

const results = [];
const vitest = './node_modules/vitest/vitest.mjs';
const selected = [
  'tests/unit/locale-routes.vitest.test.ts',
  'tests/unit/browser-storage.vitest.test.ts',
];
let baseline;
let baselineFailed = false;
for (let round = 0; round < 4; round++) {
  // Alternate order; don't mix the warmup or CPU-profiled run into warm timings.
  const runtimes = round % 2 ? ['bun', 'node'] : ['node', 'bun'];
  for (const runtime of runtimes) {
    const report = join(output, `${runtime}-vitest-${round}.json`);
    const result = await run(`${runtime}-vitest`, runtime, [
      ...(round === 3 ? ['--cpu-prof', `--cpu-prof-dir=${output}`] : []),
      vitest, 'run', '--config', 'vitest.config.ts', '--reporter=json', `--outputFile=${report}`,
    ], round);
    if (existsSync(report)) {
      const json = JSON.parse(await readFile(report, 'utf8'));
      result.counts = {
        tests: json.numTotalTests,
        passed: json.numPassedTests,
        pending: json.numPendingTests,
        failed: json.numFailedTests,
      };
      result.tests = json.testResults.flatMap((file) =>
        file.assertionResults.map((test) => [file.name, test.fullName, test.status])
      ).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      if (runtime === 'node' && result.code === 0) {
        baseline ??= result;
        if (JSON.stringify(result.tests) !== JSON.stringify(baseline.tests)) baselineFailed = true;
      } else if (runtime === 'bun') {
        result.matchesNode = baseline !== undefined &&
          JSON.stringify(result.tests) === JSON.stringify(baseline.tests);
      }
    } else if (result.code === 0) {
      throw new Error(`${runtime} exited successfully without its required JSON report.`);
    }
    if (runtime === 'node' && result.code !== 0) baselineFailed = true;
    results.push(result);
  }
}

// Probe both mock/global restoration and plain TS. This is not a full-suite migration.
for (const runtime of ['node', 'bun']) {
  const result = await run(`${runtime}-subset`, runtime, runtime === 'node'
    ? [vitest, 'run', '--config', 'vitest.config.ts', ...selected]
    : ['test', ...selected, '--timeout', '30000'], 0);
  if (runtime === 'node' && result.code !== 0) baselineFailed = true;
  results.push(result);
}

const summary = {
  commit: process.env.GITHUB_SHA,
  lockfileSha256: createHash('sha256').update(await readFile('bun.lock')).digest('hex'),
  node: process.version,
  results,
};
await writeFile(join(output, 'results.json'), JSON.stringify(summary, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, [
    '## Test runtime experiment',
    '',
    'Same checkout, lockfile, Vitest config and thread pool. Round 0 is warmup; round 3 is CPU-profiled.',
    'Native Bun is a compatibility probe only, not a replacement correctness gate.',
    '',
    '| Variant | Round | Exit | Seconds | Same test identities/statuses as Node |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((r) =>
      `| ${r.name} | ${r.round} | ${r.code} | ${(r.milliseconds / 1000).toFixed(2)} | ${r.matchesNode ?? '-'} |`),
    '',
  ].join('\n'));
}
if (baselineFailed || !baseline) throw new Error('Node control failed or changed test identities; do not interpret timings.');
