import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { loadEnv } from 'vite';
import { loadIncrementalBuildSettings } from '../config/incremental-build.mjs';
import { buildManifest, compareManifests } from './compare-builds.mjs';
import { captureQualificationInputs } from './qualification-inputs.mjs';

const rootUrl = new URL('../', import.meta.url);
const root = fileURLToPath(rootUrl);
const reportDirectory = join(root, '.cache', 'incremental-pilot');
const scenarios = ['warm', 'identity', 'api-data', 'global-input', 'og-input', 'partial-cache'];

/** @param {'clean' | 'full' | 'incremental'} kind */
export function buildArguments(kind) {
  if (!['clean', 'full', 'incremental'].includes(kind)) {
    throw new Error(`Unknown build kind: ${kind}`);
  }
  return ['build', '--mode', 'production', ...(kind === 'clean' ? ['--force'] : [])];
}

/**
 * @param {string} log
 * @returns {{reused: boolean, reason: string, htmlFiles: number, keyedHtmlFiles: number, wallMs: number}}
 */
export function pagefindMeasurement(log) {
  const records = [
    ...stripVTControlCharacters(log).matchAll(/^\[incremental-build\] pagefind (\{[^\r\n]+\})$/gm),
  ];
  if (records.length !== 1) throw new Error('Expected one Pagefind cache measurement.');
  const result = JSON.parse(records[0][1]);
  if (
    typeof result.reused !== 'boolean' ||
    !['hit', 'inputs', 'force', 'missing', 'damaged'].includes(result.reason) ||
    result.reused !== (result.reason === 'hit') ||
    !Number.isSafeInteger(result.htmlFiles) ||
    !Number.isSafeInteger(result.keyedHtmlFiles) ||
    result.htmlFiles < result.keyedHtmlFiles ||
    result.keyedHtmlFiles <= 0 ||
    !Number.isFinite(result.wallMs) ||
    result.wallMs < 0
  ) {
    throw new Error('Invalid Pagefind cache measurement.');
  }
  return result;
}

/** @param {string} log */
export function restoredPaths(log) {
  return [...stripVTControlCharacters(log).matchAll(/(\S+)\s+\((?:restored|cached)\)/g)].map(
    (match) => match[1]
  );
}

/** @param {string} log */
export function restoredRouteCounts(log) {
  const paths = restoredPaths(log);
  const api = paths.filter((path) => /^\/reference\/api\/(?:csharp|typescript)\//.test(path));
  const og = paths.filter((path) => /^\/og\/.+\.png\/?$/.test(path));
  if (api.length + og.length !== paths.length) {
    const unexpected = paths.filter((path) => !api.includes(path) && !og.includes(path));
    throw new Error(
      `Unexpected route reused outside the API/OG pilot: ${unexpected.slice(0, 10).join(', ')}`
    );
  }
  const markdownRestored = api.filter((path) => /\.md\/?$/.test(path)).length;
  return {
    htmlRestored: api.length - markdownRestored,
    markdownRestored,
    ogRestored: og.length,
  };
}

/**
 * @param {string} log
 * @returns {{htmlFiles: number, parsedPages: number, reusedPages: number, wallMs: number}}
 */
export function identityFinalization(log) {
  const records = [
    ...stripVTControlCharacters(log).matchAll(
      /^\[incremental-build\] finalized identity (\{[^\r\n]+\})$/gm
    ),
  ];
  if (records.length !== 1) throw new Error('Expected one identity-finalization measurement.');
  const result = JSON.parse(records[0][1]);
  if (
    !['htmlFiles', 'parsedPages', 'reusedPages'].every(
      (key) => Number.isSafeInteger(result[key]) && result[key] >= 0
    ) ||
    result.parsedPages + result.reusedPages !== result.htmlFiles ||
    !Number.isFinite(result.wallMs) ||
    result.wallMs < 0
  ) {
    throw new Error('Invalid identity-finalization measurement.');
  }
  return result;
}

/**
 * @param {string} current
 * @param {string[]} candidates
 */
export function changedIdentity(current, candidates) {
  if (![current, ...candidates].every((value) => /^[a-f\d]{40}$/i.test(value))) {
    throw new Error('Identity qualification requires full git commit IDs.');
  }
  const identity = candidates.find((value) => value.toLowerCase() !== current.toLowerCase());
  if (!identity) throw new Error('Identity qualification requires a different real commit.');
  return identity;
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
  const buildEnv = loadEnv('production', root, ['PUBLIC_', 'GIT_COMMIT_ID']);
  const baselineIdentity = buildEnv.PUBLIC_GIT_COMMIT_ID || buildEnv.GIT_COMMIT_ID || '';
  const sourceDateEpoch =
    process.env.SOURCE_DATE_EPOCH ??
    execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  const measurements = [];

  async function build(label, kind, env = {}, requireReuse = false) {
    const incremental = kind === 'incremental';
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
            ...buildArguments(kind),
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
    const wallMs = performance.now() - started;
    const output = await readFile(logPath, 'utf8');
    const { htmlRestored, markdownRestored, ogRestored } = restoredRouteCounts(output);
    const identity = incremental ? identityFinalization(output) : undefined;
    const search = incremental ? pagefindMeasurement(output) : undefined;
    measurements.push({
      label,
      kind,
      buildIdentity: env.PUBLIC_GIT_COMMIT_ID || baselineIdentity,
      sourceDateEpoch,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      wallMs,
      htmlRestored,
      markdownRestored,
      ogRestored,
      identityFinalization: identity,
      pagefind: search,
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
    if (requireReuse && !identity?.reusedPages) {
      throw new Error(`${label}: expected exact-content identity range reuse.`);
    }
    if (requireReuse && !ogRestored) {
      throw new Error(`${label}: expected unchanged OG image reuse.`);
    }
    if (
      (label.startsWith('incremental-warm') || label === 'api-data-incremental') &&
      !search?.reused
    ) {
      throw new Error(`${label}: expected unchanged Pagefind bundle reuse.`);
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

  const clean = await build('clean', 'clean');
  await equivalent('clean-repeat', clean, await build('clean-repeat', 'clean'));
  if (['warm', 'api-data'].includes(scenario)) {
    await equivalent('full-warm', clean, await build('full-warm', 'full'));
  }
  await equivalent('incremental-first', clean, await build('incremental-first', 'incremental'));
  await equivalent('incremental-warm', clean, await build('incremental-warm', 'incremental', {}, true));
  if (scenario === 'warm') {
    await equivalent(
      'incremental-warm-repeat',
      clean,
      await build('incremental-warm-repeat', 'incremental', {}, true)
    );
    await equivalent('full-warm-repeat', clean, await build('full-warm-repeat', 'full'));
  }

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
      const candidates = execFileSync('git', ['rev-list', '--max-count=2', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      })
        .trim()
        .split(/\s+/);
      env.PUBLIC_GIT_COMMIT_ID = changedIdentity(baselineIdentity, candidates);
      console.log(
        `[incremental-pilot] identity: ${baselineIdentity} -> ${env.PUBLIC_GIT_COMMIT_ID}`
      );
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
    } else if (scenario === 'og-input') {
      const path = join(root, 'public', 'og-image.png');
      const original = await readFile(path);
      restoreSource = () => writeFile(path, original);
      const { default: sharp } = await import('sharp');
      await writeFile(path, await sharp(original).negate({ alpha: false }).png().toBuffer());
    } else if (scenario === 'partial-cache') {
      const { cacheDir } = await loadIncrementalBuildSettings(rootUrl, 'production');
      const manifest = JSON.parse(
        await readFile(new URL('incremental-build.json', cacheDir), 'utf8')
      );
      const entries = Object.values(manifest.routes).flatMap((route) => Object.values(route.paths));
      for (const prefix of ['reference/api/', 'og/']) {
        const entry = entries.find((entry) => entry.outputFile.startsWith(prefix));
        if (!entry || entry.outputFile.includes('..')) {
          throw new Error('Refusing to remove an unexpected cached output path.');
        }
        await rm(new URL(entry.outputFile, new URL('dist/', cacheDir)));
        console.log(`[incremental-pilot] Removed one cached output: ${entry.outputFile}`);
      }
      await writeFile(new URL('pagefind-bundle/pagefind-entry.json', cacheDir), 'damaged probe');
    }
    if (scenario !== 'warm') {
      const expected = await build(`${scenario}-clean`, 'clean', env);
      if (scenario === 'api-data') {
        await equivalent(`${scenario}-full`, expected, await build(`${scenario}-full`, 'full', env));
      }
      if (
        scenario === 'identity' &&
        !compareManifests(clean, expected).changed.some((path) => path.endsWith('.html'))
      ) {
        throw new Error('The changed build identity must change rendered HTML.');
      }
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
      if (
        scenario === 'og-input' &&
        !compareManifests(clean, expected).changed.some((path) => path.startsWith('og/'))
      ) {
        throw new Error('The background fixture must change generated OG images.');
      }
      const globalInvalidation = ['global-input', 'og-input'].includes(scenario);
      const actual = await build(`${scenario}-incremental`, 'incremental', env, !globalInvalidation);
      if (scenario === 'api-data') await verifyContentProbe(actual);
      await equivalent(scenario, expected, actual);
      if (
        globalInvalidation &&
        (measurements.at(-1).htmlRestored !== 0 || measurements.at(-1).ogRestored !== 0)
      ) {
        throw new Error('A global input change must invalidate the compatibility partition.');
      }
      if (
        ['identity', 'partial-cache'].includes(scenario) &&
        measurements.at(-1).pagefind.reused
      ) {
        throw new Error('Changed identity or damaged search cache must rebuild the index.');
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
