import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { describe, expect, test, vi } from 'vitest';

const source = readFileSync(
  new URL('../../src/scripts/deployment-guard.ts', import.meta.url),
  'utf8',
);
const script = transpileModule(source, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;

function fixture(running: string | null, incoming: string | null) {
  const events = new EventTarget();
  const meta = running === null ? null : { content: running };
  const warn = vi.fn();
  runInNewContext(script, {
    exports: {},
    console: { warn },
    document: {
      querySelector: () => meta,
      addEventListener: events.addEventListener.bind(events),
    },
  });
  const controller = new AbortController();
  const load = vi.fn(async () => {});
  const event = Object.assign(new Event('astro:before-preparation', { cancelable: true }), {
    loader: load,
    signal: controller.signal,
    newDocument: { querySelector: () => incoming === null ? null : { content: incoming } },
  });
  events.dispatchEvent(event);
  return { event, load, controller, warn, meta };
}

describe('deployment boundary navigation', () => {
  test.each([
    ['same deployment', 'build-a', 'build-a', false],
    ['new deployment', 'build-a', 'build-b', true],
    ['missing destination metadata', 'build-a', null, true],
    ['missing running metadata', null, 'build-b', true],
    ['unversioned local documents', null, null, false],
    ['trimmed metadata', ' build-a ', 'build-a', false],
  ])('%s', async (_label, running, incoming, reload) => {
    const { event, load, warn } = fixture(running, incoming);
    expect(event.defaultPrevented).toBe(false);
    await event.loader();
    expect(load).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(reload);
    expect(warn).toHaveBeenCalledTimes(reload && (!running || !incoming) ? 1 : 0);
  });

  test('retains the running deployment instead of reading mutated page metadata', async () => {
    const { event, meta } = fixture('build-a', 'build-b');
    meta!.content = 'build-b';
    await event.loader();
    expect(event.defaultPrevented).toBe(true);
  });

  test('respects navigation cancellation and aborts during loading', async () => {
    const canceled = fixture('build-a', null);
    canceled.event.preventDefault();
    await canceled.event.loader();
    expect(canceled.warn).not.toHaveBeenCalled();

    const aborted = fixture('build-a', 'build-b');
    aborted.load.mockImplementation(() => {
      aborted.controller.abort();
      return Promise.resolve();
    });
    await aborted.event.loader();
    expect(aborted.event.defaultPrevented).toBe(false);
  });

  test('does not hide loader failures', async () => {
    const { event, load } = fixture('build-a', 'build-b');
    load.mockRejectedValue(new Error('navigation failed'));
    await expect(event.loader()).rejects.toThrow('navigation failed');
    expect(event.defaultPrevented).toBe(false);
  });
});
