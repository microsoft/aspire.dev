import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  extractTwoslashBlocks,
  getRenderedFailureBlocks,
  runAudit,
  type AuditReport,
  type BlockResult,
} from './twoslash-blocks-audit.ts';

interface MockOptions {
  compilerOptions: { strict: boolean };
  handbookOptions: { noErrorValidation: boolean };
  extraFiles: Record<string, string>;
}

interface MockDiagnostic {
  code: number;
  line?: number;
  character?: number;
  text?: string;
  renderedMessage?: string;
}

const mocks = vi.hoisted(() => ({
  enabled: true,
  exists: true,
  readFile: vi.fn<(path: string, encoding: string) => string>(),
  readDir: vi.fn<(path: string) => object[]>(),
  options: vi.fn<() => MockOptions>(),
  readTypes: vi.fn<() => { exists: boolean; source: string }>(),
  compiler:
    vi.fn<(source: string, lang: string, options: MockOptions) => { errors: MockDiagnostic[] }>(),
}));

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFile,
  readdirSync: mocks.readDir,
}));

vi.mock('@ec-ts/twoslash', () => ({ createTwoslasher: () => mocks.compiler }));

vi.mock('../../config/twoslash.config.mjs', () => ({
  get TWOSLASH_ENABLED() {
    return mocks.enabled;
  },
  TWOSLASH_LANGUAGES: ['ts', 'tsx', 'typescript'],
  getTwoslashOptions: mocks.options,
  finishTwoslashRun: vi.fn(),
  readAspireTypes: mocks.readTypes,
}));

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/content/docs');
const files = new Map<string, string>();
const badSource = 'const value: string = 1;\nvalue.missing();';
const diagnostics: MockDiagnostic[] = [
  { code: 2322, text: 'Type mismatch\nMore detail', line: 0, character: 6 },
  { code: 2339, renderedMessage: 'Missing member', line: 1 },
  { code: 9999, line: 1, character: 2 },
  { code: 1000, text: 'No source location' },
];

function fence(source: string, lang = 'ts', meta = 'twoslash'): string {
  return `\`\`\`${lang} ${meta}\n${source}\n\`\`\``;
}

function addPage(page: string, content: string): void {
  files.set(join(docsRoot, page), content);
}

// Reference the pre-cache algorithm, calling the mocked compiler for every
// occurrence. Keep its location mutation so report equivalence catches aliasing.
function runUncachedReference(): AuditReport {
  const results: BlockResult[] = [];
  const inputs = new Set<string>();
  const options = mocks.options();
  for (const absPath of [...files.keys()].sort()) {
    const page = relative(docsRoot, absPath).split(sep).join('/');
    for (const { location, source } of extractTwoslashBlocks(files.get(absPath)!, page, absPath)) {
      const lang = location.lang === 'typescript' ? 'ts' : location.lang;
      inputs.add(JSON.stringify([lang, source]));
      const result: BlockResult = {
        location,
        source,
        diagnostics: [],
        crashed: false,
        crashMessage: undefined,
      };
      try {
        result.diagnostics = mocks
          .compiler(source, lang, options)
          .errors.filter((error) => error && typeof error.line === 'number')
          .map((error) => ({
            code: error.code,
            message:
              error.text ?? error.renderedMessage ?? `(unknown ts(${error.code}) diagnostic)`,
            mdxLine: 0,
            column: (error.character ?? 0) + 1,
            blockLine: (error.line ?? 0) + 1,
          }));
      } catch (error) {
        result.crashed = true;
        result.crashMessage = error instanceof Error ? error.message : String(error);
      }
      for (const diagnostic of result.diagnostics) {
        diagnostic.mdxLine = location.fenceLine + diagnostic.blockLine;
      }
      results.push(result);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    twoslashEnabled: true,
    filesScanned: files.size,
    blocksScanned: results.length,
    uniqueInputs: inputs.size,
    compilerCalls: results.length,
    blocksWithErrors: results.filter(
      (result) => result.crashed || result.diagnostics.length > 0
    ).length,
    totalDiagnostics: results.reduce((total, result) => total + result.diagnostics.length, 0),
    results,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  files.clear();
  mocks.enabled = true;
  mocks.exists = true;
  mocks.options.mockReturnValue({
    compilerOptions: { strict: true },
    handbookOptions: { noErrorValidation: true },
    extraFiles: { '.aspire/modules/aspire.mts': 'export declare const version: 1;' },
  });
  mocks.readTypes.mockImplementation(() => ({ exists: mocks.exists, source: 'declarations' }));
  mocks.readFile.mockImplementation((path) => {
    const source = files.get(path);
    if (source === undefined) throw new Error(`Missing fixture: ${path}`);
    return source;
  });
  mocks.readDir.mockImplementation((path) => {
    const entries = new Map<string, boolean>();
    for (const file of files.keys()) {
      const parts = relative(path, file).split(sep);
      if (parts[0] === '..') continue;
      entries.set(parts[0], parts.length > 1);
    }
    return [...entries].map(([name, directory]) => ({
      name,
      isDirectory: () => directory,
      isFile: () => !directory,
    }));
  });
  mocks.compiler.mockImplementation((source) => {
    if (source === 'crash') throw new Error('Compiler crashed');
    if (source === 'string-crash') {
      const thrown: unknown = 'Non-Error compiler crash';
      throw thrown;
    }
    return { errors: source.includes('value.missing()') ? diagnostics : [] };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('twoslash audit input deduplication', () => {
  test('matches every uncached report field while compiling each effective input once', () => {
    addPage(
      'z.mdx',
      [
        fence(badSource, 'tsx'),
        fence(badSource),
        fence(`${badSource}\n// @strict: false`),
        fence('crash'),
        fence('crash', 'typescript'),
        fence('string-crash'),
        fence('string-crash'),
      ].join('\n\n')
    );
    addPage(
      join('nested', 'a.mdx'),
      [
        '# Heading',
        fence(badSource),
        'Different source location',
        fence(badSource, 'typescript', 'title="another.mts" twoslash'),
        fence('const valid = 1;'),
      ].join('\n\n')
    );
    addPage('empty.mdx', fence('ignored', 'ts', 'title="without-trigger"'));

    const uncached = runUncachedReference();
    expect(mocks.compiler).toHaveBeenCalledTimes(10);
    mocks.compiler.mockClear();

    const cached = runAudit();
    expect(cached).toEqual({ ...uncached, compilerCalls: 6 });
    expect(cached).toMatchObject({
      filesScanned: 3,
      blocksScanned: 10,
      uniqueInputs: 6,
      blocksWithErrors: 9,
      totalDiagnostics: 15,
    });
    expect(mocks.compiler).toHaveBeenCalledTimes(cached.uniqueInputs);
    expect(mocks.compiler.mock.calls.filter(([, lang]) => lang === 'tsx')).toHaveLength(1);
    expect(mocks.compiler.mock.calls.some(([, lang]) => lang === 'typescript')).toBe(false);
    expect(getRenderedFailureBlocks(cached)).toEqual(getRenderedFailureBlocks(uncached));
  });

  test('gives every occurrence independent diagnostic objects and correct MDX coordinates', () => {
    addPage('a.mdx', `${fence(badSource)}\n\n\n${fence(badSource, 'typescript')}`);
    addPage('b.mdx', `# Heading\n\n${fence(badSource)}`);
    const report = runAudit();
    expect(
      report.results.map((result) => result.diagnostics.map((error) => error.mdxLine))
    ).toEqual([
      [2, 3, 3],
      [8, 9, 9],
      [4, 5, 5],
    ]);
    const [first, second, third] = report.results;
    expect(first.diagnostics).not.toBe(second.diagnostics);
    expect(first.diagnostics[0]).not.toBe(second.diagnostics[0]);
    expect(second.diagnostics[0]).not.toBe(third.diagnostics[0]);
    expect(first.diagnostics[0]).toEqual({
      code: 2322,
      message: 'Type mismatch\nMore detail',
      mdxLine: 2,
      column: 7,
      blockLine: 1,
    });
    first.diagnostics[0].message = 'changed after reporting';
    expect(second.diagnostics[0].message).toBe('Type mismatch\nMore detail');
    expect(third.diagnostics[0].message).toBe('Type mismatch\nMore detail');
    expect(diagnostics[0]).not.toHaveProperty('mdxLine');
  });

  test('does not reuse compilations across audits or changed options and declarations', () => {
    addPage('a.mdx', fence(badSource));
    const first = runAudit();
    const firstOptions = mocks.compiler.mock.calls[0][2];
    mocks.options.mockReturnValue({
      compilerOptions: { strict: false },
      handbookOptions: { noErrorValidation: false },
      extraFiles: { '.aspire/modules/aspire.mts': 'export declare const version: 2;' },
    });
    const second = runAudit();
    const third = runAudit();
    expect(mocks.options).toHaveBeenCalledTimes(3);
    expect(mocks.compiler).toHaveBeenCalledTimes(3);
    expect(mocks.compiler.mock.calls[1][2]).not.toEqual(firstOptions);
    expect(mocks.compiler.mock.calls[1][2]).toEqual(mocks.options());
    expect([first.compilerCalls, second.compilerCalls, third.compilerCalls]).toEqual([1, 1, 1]);
    expect(first.results[0].diagnostics[0]).not.toBe(second.results[0].diagnostics[0]);
  });

  test('retains failures for every occurrence, including Error and non-Error crashes', () => {
    addPage(
      'a.mdx',
      ['crash', 'string-crash', 'crash', 'string-crash'].map((source) => fence(source)).join('\n\n')
    );
    const report = runAudit();
    expect(report.compilerCalls).toBe(2);
    expect(report.uniqueInputs).toBe(2);
    expect(report.blocksWithErrors).toBe(4);
    expect(report.totalDiagnostics).toBe(0);
    expect(getRenderedFailureBlocks(report)).toHaveLength(4);
    expect(
      report.results.map(({ crashed, crashMessage, diagnostics }) => ({
        crashed,
        crashMessage,
        diagnostics,
      }))
    ).toEqual([
      { crashed: true, crashMessage: 'Compiler crashed', diagnostics: [] },
      { crashed: true, crashMessage: 'Non-Error compiler crash', diagnostics: [] },
      { crashed: true, crashMessage: 'Compiler crashed', diagnostics: [] },
      { crashed: true, crashMessage: 'Non-Error compiler crash', diagnostics: [] },
    ]);
    expect(report.results[0].diagnostics).not.toBe(report.results[2].diagnostics);
  });

  test('still treats malformed compiler results as crashes', () => {
    addPage('a.mdx', `${fence('source')}\n\n${fence('source')}`);
    mocks.compiler.mockReturnValue({ errors: undefined as unknown as MockDiagnostic[] });
    const report = runAudit();
    expect(report.compilerCalls).toBe(1);
    expect(report.blocksWithErrors).toBe(2);
    expect(report.results.every((result) => result.crashed)).toBe(true);
  });

  test('retries previously crashing inputs on the next invocation', () => {
    addPage('a.mdx', `${fence('crash')}\n\n${fence('crash')}`);
    expect(runAudit().blocksWithErrors).toBe(2);
    mocks.compiler.mockReturnValue({ errors: [] });
    const recovered = runAudit();
    expect(mocks.compiler).toHaveBeenCalledTimes(2);
    expect(recovered.compilerCalls).toBe(1);
    expect(getRenderedFailureBlocks(recovered)).toEqual([]);
    expect(recovered.results.every((result) => result.crashed === false)).toBe(true);
  });

  test('caches successful empty results without sampling or dropping occurrences', () => {
    const blockCount = 1000;
    addPage(
      'many.mdx',
      Array.from({ length: blockCount }, (_, index) =>
        fence(`const valid = ${index % 5};`, index % 2 ? 'typescript' : 'ts')
      ).join('\n\n')
    );
    const uncached = runUncachedReference();
    expect(mocks.compiler).toHaveBeenCalledTimes(blockCount);
    mocks.compiler.mockClear();
    const cached = runAudit();
    expect(cached).toEqual({ ...uncached, compilerCalls: 5 });
    expect(cached.uniqueInputs).toBe(5);
    expect(mocks.compiler).toHaveBeenCalledTimes(5);
    expect(cached.results).toHaveLength(blockCount);
    expect(cached.results[0].diagnostics).not.toBe(cached.results[1].diagnostics);
  });

  test('preserves the disabled report and skips all compiler, declaration, and filesystem work', () => {
    mocks.enabled = false;
    mocks.exists = false;
    expect(runAudit()).toEqual({
      generatedAt: new Date().toISOString(),
      twoslashEnabled: false,
      filesScanned: 0,
      blocksScanned: 0,
      uniqueInputs: 0,
      compilerCalls: 0,
      blocksWithErrors: 0,
      totalDiagnostics: 0,
      results: [],
    });
    expect(mocks.options).not.toHaveBeenCalled();
    expect(mocks.readTypes).not.toHaveBeenCalled();
    expect(mocks.readDir).not.toHaveBeenCalled();
    expect(mocks.compiler).not.toHaveBeenCalled();
  });

  test('keeps missing declarations and unexpected filesystem failures fatal', () => {
    mocks.exists = false;
    expect(() => runAudit()).toThrow(
      'aspire.d.ts is missing — run `pnpm twoslash-types` before auditing.'
    );
    expect(mocks.compiler).not.toHaveBeenCalled();
    mocks.exists = true;
    mocks.readDir.mockImplementationOnce(() => {
      throw new Error('Cannot scan');
    });
    expect(() => runAudit()).toThrow('Cannot scan');
    addPage('a.mdx', fence('valid'));
    mocks.readFile.mockImplementationOnce(() => {
      throw new Error('Cannot read');
    });
    expect(() => runAudit()).toThrow('Cannot read');
  });

  test('reports zero compiler work when no twoslash blocks exist', () => {
    addPage('a.mdx', '# No samples');
    expect(runAudit()).toMatchObject({
      filesScanned: 1,
      blocksScanned: 0,
      uniqueInputs: 0,
      compilerCalls: 0,
      blocksWithErrors: 0,
      totalDiagnostics: 0,
      results: [],
    });
    expect(mocks.compiler).not.toHaveBeenCalled();
  });
});
