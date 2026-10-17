import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  captureQualificationInputs,
  replayQualificationInputs,
} from '../../scripts/qualification-inputs.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const url =
  'https://raw.githubusercontent.com/Rettend/github-material-icon-theme/main/download/version.txt';

it('replays independent responses without requesting or changing captured content', async () => {
  const fallback = vi.fn<typeof fetch>();
  const snapshot = {
    [url]: { body: 'fixture', contentType: 'text/plain' },
  };
  const replay = replayQualificationInputs(snapshot, fallback);
  for (let index = 0; index < 2; index++) {
    const response = await replay(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(await response.text()).toBe(snapshot[url].body);
  }
  expect(fallback).not.toHaveBeenCalled();
});

it('does not fabricate missing inputs or replay writes', async () => {
  const replay = replayQualificationInputs({}, vi.fn<typeof fetch>());
  await expect(replay(url)).rejects.toThrow('Uncaptured qualification request');
  await expect(replay(url, { method: 'POST' })).rejects.toThrow('Uncaptured qualification request');
});

it('leaves unrelated requests and their options unchanged', async () => {
  const fallback = vi.fn<typeof fetch>().mockResolvedValue(new Response('live'));
  const replay = replayQualificationInputs({}, fallback);
  const options = { headers: { 'x-fixture': 'value' } };
  const other = 'https://example.com/repos/microsoft/aspire/contributors';
  expect(await (await replay(other, options)).text()).toBe('live');
  expect(fallback).toHaveBeenCalledWith(other, options);
});

it('preloads recorded inputs and fails even when a dependency catches a missing input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aspire-replay-'));
  const path = join(directory, 'snapshot.json');
  await writeFile(path, JSON.stringify({ [url]: { body: 'fixture', contentType: 'text/plain' } }));
  const preload = new URL('../../scripts/qualification-inputs.mjs', import.meta.url).href;
  const options = {
    env: { ...process.env, CI: 'true', ASPIRE_QUALIFICATION_INPUTS: path },
    encoding: 'utf8' as const,
  };
  try {
    const success = spawnSync(
      process.execPath,
      [
        '--import',
        preload,
        '-e',
        `fetch(${JSON.stringify(url)}).then(r => r.text()).then(console.log)`,
      ],
      options
    );
    expect(success.stderr).toBe('');
    expect(success.status).toBe(0);
    expect(success.stdout.trim()).toBe('fixture');
    const failure = spawnSync(
      process.execPath,
      [
        '--import',
        preload,
        '-e',
        `fetch(${JSON.stringify(url.replace('version.txt', 'language-map.json'))}).catch(() => process.exit(0))`,
      ],
      options
    );
    expect(failure.status).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('captures only successful public bodies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aspire-inputs-'));
  const path = join(directory, 'snapshot.json');
  vi.stubEnv('CI', 'true');
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(() => Promise.resolve(new Response('{}')));
  vi.stubGlobal('fetch', fetch);
  try {
    await captureQualificationInputs(path);
    const text = await readFile(path, 'utf8');
    expect(Object.keys(JSON.parse(text))).toHaveLength(3);
    expect(
      fetch.mock.calls
        .map(([input]) => (typeof input === 'string' ? input : ''))
        .filter((input) => input.startsWith('https://raw.githubusercontent.com/'))
    ).toHaveLength(3);
    fetch.mockResolvedValue(new Response('Unavailable', { status: 503 }));
    await expect(captureQualificationInputs(path)).rejects.toThrow(
      'Qualification input failed: 503'
    );
    expect(await readFile(path, 'utf8')).toBe(text);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
