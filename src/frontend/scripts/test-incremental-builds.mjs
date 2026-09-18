import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { loadIncrementalBuildSettings } from '../config/incremental-build.mjs';
import { buildManifest, compareManifests } from './compare-builds.mjs';
import { captureQualificationInputs } from './qualification-inputs.mjs';

const rootUrl = new URL('../', import.meta.url);
const root = fileURLToPath(rootUrl);
const reportDirectory = join(root, '.cache', 'incremental-pilot');
const scenarios = ['warm', 'identity', 'api-data', 'global-input', 'partial-cache'];

/** @param {string} log */
export function restoredPaths(log) {
  return [...stripVTControlCharacters(log).matchAll(/(\S+)\s+\((?:restored|cached)\)/g)].map(
    (match) => match[1]
  );
}

async function runPilot(scenario) {
  if (process.env.CI !== 'true')
    throw new Error('This multi-build qualification harness is CI-only.');
  if (!scenarios.includes(scenario)) throw new Error(`Unknown pilot scenario: ${scenario}`);
  if (process.env.ASTRO_OUT_DIR)
    throw new Error('The pilot requires the normal dist output directory.');
  await mkdir(reportDirectory, { recursive: true });
  const inputSnapshot = join(reportDirectory, 'input-snapshot.json');
  await captureQualificationInputs(inputSnapshot);
  const sourceDateEpoch = execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const measurements = [];

  async function build(label, incremental, env = {}, requireReuse = false) {
    const logPath = join(reportDirectory, `${label}.log`);
    const log = createWriteStream(logPath);
    const started = performance.now();
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            '--import',
            new URL('./qualification-inputs.mjs', import.meta.url).href,
            join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'),
            'build',
            '--mode',
            'production',
            ...(!incremental ? ['--force'] : []),
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              ...env,
              ASPIRE_QUALIFICATION_INPUTS: inputSnapshot,
              SOURCE_DATE_EPOCH: sourceDateEpoch,
              ASPIRE_INCREMENTAL_BUILD: incremental ? '1' : '0',
              ASTRO_TELEMETRY_DISABLED: '1',
              BUILD_TIMING: '1',
              BUILD_TIMING_LABEL: label,
              BUILD_TIMING_OUT: join(reportDirectory, 'phases.jsonl'),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        for (const stream of [child.stdout, child.stderr]) {
          stream.on('data', (chunk) => {
            log.write(chunk);
            process.stdout.write(chunk);
          });
        }
        child.once('error', reject);
        child.once('close', (code, signal) => {
          if (code !== 0) reject(new Error(`${label} failed: exit=${code}, signal=${signal}`));
          else resolve();
        });
      });
    } finally {
      log.end();
      await finished(log);
    }
    const paths = restoredPaths(await readFile(logPath, 'utf8'));
    if (paths.some((path) => !/^\/reference\/api\/(?:csharp|typescript)\//.test(path))) {
      throw new Error(`Unexpected route reused outside the API-only pilot: ${paths.join(', ')}`);
    }
    const markdownRestored = paths.filter((path) => path.endsWith('.md')).length;
    const htmlRestored = paths.length - markdownRestored;
    measurements.push({
      label,
      sourceDateEpoch,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      wallMs: performance.now() - started,
      htmlRestored,
      markdownRestored,
    });
    await writeFile(
      join(reportDirectory, 'measurements.json'),
      JSON.stringify(measurements, null, 2)
    );
    if (requireReuse && (!htmlRestored || !markdownRestored)) {
      throw new Error(
        `${label}: expected both HTML and Markdown reuse; got ${htmlRestored}/${markdownRestored}.`
      );
    }
    const manifest = await buildManifest(join(root, 'dist'));
    await writeFile(join(reportDirectory, `${label}-manifest.json`), JSON.stringify(manifest));
    return manifest;
  }

  async function equivalent(label, expected, actual) {
    const differences = compareManifests(expected, actual);
    await writeFile(
      join(reportDirectory, `${label}-diff.json`),
      JSON.stringify(differences, null, 2)
    );
    if (Object.values(differences).some((paths) => paths.length)) {
      throw new Error(
        `${label}: output differs; see ${label}-diff.json. No normalization is allowed.`
      );
    }
  }

  const clean = await build('clean', false);
  await equivalent('clean-repeat', clean, await build('clean-repeat', false));
  await equivalent('incremental-first', clean, await build('incremental-first', true));
  await equivalent('incremental-warm', clean, await build('incremental-warm', true, {}, true));

  let restoreSource;
  let mutationPrefix;
  function commitFixture(path, message) {
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Copilot App',
        '-c',
        'user.email=223556219+Copilot@users.noreply.github.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--only',
        '-m',
        message,
        '-m',
        'Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>',
        '--',
        path,
      ],
      { cwd: root, stdio: 'pipe' }
    );
  }
  const contentProbe = 'Incremental cache sibling edit probe.';
  async function verifyContentProbe(manifest) {
    const matches = [];
    for (const path of Object.keys(manifest).filter(
      (name) => name.startsWith(mutationPrefix) && /\.(?:html|md)$/.test(name)
    )) {
      if ((await readFile(join(root, 'dist', path), 'utf8')).includes(contentProbe)) {
        matches.push(path);
      }
    }
    if (
      !matches.some((path) => path.endsWith('.html')) ||
      !matches.some((path) => path.endsWith('.md'))
    ) {
      throw new Error('The API sibling edit must appear in both rendered HTML and Markdown.');
    }
  }
  try {
    const env = {};
    if (scenario === 'identity') {
      const identity = execFileSync('git', ['rev-parse', 'HEAD^'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      env.PUBLIC_GIT_COMMIT_ID = identity;
    } else if (scenario === 'api-data') {
      const directory = join(root, 'src', 'data', 'pkgs');
      let selected;
      for (const name of (await readdir(directory)).sort()) {
        if (!name.endsWith('.json')) continue;
        const path = join(directory, name);
        const original = await readFile(path, 'utf8');
        const data = JSON.parse(original);
        if (data.types?.filter((type) => type.name).length >= 3) {
          selected = { path, original, data };
          break;
        }
      }
      if (!selected) throw new Error('No API package supports the mutation fixture.');
      const { path, original, data } = selected;
      let committed = false;
      restoreSource = async () => {
        await writeFile(path, original);
        if (committed) commitFixture(path, 'Restore incremental API qualification fixture');
      };
      const [renamed, removed, edited] = data.types.filter((type) => type.name);
      renamed.name += 'IncrementalProbe';
      renamed.fullName = `${renamed.namespace}.${renamed.name}`;
      edited.docs = { ...edited.docs, summary: [{ kind: 'text', text: contentProbe }] };
      mutationPrefix = `reference/api/csharp/${data.package.name.toLowerCase()}/`;
      data.types = data.types.filter((type) => type !== removed);
      data.types.push({
        ...structuredClone(renamed),
        name: 'IncrementalAddedProbe',
        fullName: `${renamed.namespace}.IncrementalAddedProbe`,
      });
      await writeFile(path, JSON.stringify(data, null, 2));
      commitFixture(path, 'Exercise incremental reuse across a real API-data commit');
      committed = true;
      console.log(`[incremental-pilot] API add/delete/rename/sibling mutation: ${path}`);
    } else if (scenario === 'global-input') {
      const path = join(root, 'src', 'styles', 'site.css');
      const original = await readFile(path, 'utf8');
      restoreSource = () => writeFile(path, original);
      await writeFile(path, original + '\n:root { --incremental-pilot-probe: 1; }\n');
    } else if (scenario === 'partial-cache') {
      const { cacheDir } = await loadIncrementalBuildSettings(rootUrl, 'production');
      const manifest = JSON.parse(
        await readFile(new URL('incremental-build.json', cacheDir), 'utf8')
      );
      const route = Object.values(manifest.routes)[0];
      const entry = Object.values(route.paths)[0];
      if (!entry.outputFile.startsWith('reference/api/') || entry.outputFile.includes('..')) {
        throw new Error('Refusing to remove an unexpected cached output path.');
      }
      await rm(new URL(entry.outputFile, new URL('dist/', cacheDir)));
      console.log(`[incremental-pilot] Removed one cached output: ${entry.outputFile}`);
    }
    if (scenario !== 'warm') {
      const expected = await build(`${scenario}-clean`, false, env);
      if (scenario === 'api-data') {
        await verifyContentProbe(expected);
        const differences = compareManifests(clean, expected);
        if (
          !differences.missing.some((path) => path.startsWith(mutationPrefix)) ||
          !differences.extra.some((path) => path.startsWith(mutationPrefix))
        ) {
          throw new Error('The API mutation must remove old routes and introduce new routes.');
        }
      }
      const actual = await build(`${scenario}-incremental`, true, env, scenario !== 'global-input');
      if (scenario === 'api-data') await verifyContentProbe(actual);
      await equivalent(scenario, expected, actual);
      if (scenario === 'global-input' && measurements.at(-1).htmlRestored !== 0) {
        throw new Error('A global CSS change must invalidate the compatibility partition.');
      }
    }
  } finally {
    await restoreSource?.();
  }
  console.log(
    `[incremental-pilot] ${scenario}: byte-equivalent complete output; production remains opt-out.`
  );
}

if (import.meta.main) await runPilot(process.argv[2] || 'warm');
