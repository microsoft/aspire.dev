import { createTwoslasher, twoslasher } from '@ec-ts/twoslash';
import { expect, test } from 'vitest';
import {
  finishTwoslashRun,
  getTwoslashExtraFiles,
  getTwoslashOptions,
  TWOSLASH_COMPILER_OPTIONS,
  TWOSLASH_HANDBOOK_OPTIONS,
} from '../../config/twoslash.config.mjs';

const sdkPath = '/.aspire/modules/aspire.mts';
const snippets = [
  "import { createBuilder } from './.aspire/modules/aspire.mjs';\nconst builder = await createBuilder();\nconst cache = await builder.addRedis('cache');",
  "import { createBuilder } from './.aspire/modules/aspire.mjs';\nconst builder = await createBuilder();\nconst database = await builder.addPostgres('database');",
  'const value: string = 123;',
  '// @filename: helper.ts\nexport const onlyHere = 42;\n// @filename: index.ts\nimport { onlyHere } from "./helper";\nonlyHere;',
  'import { onlyHere } from "./helper";\nonlyHere;',
];

test('persistent SDK filesystem preserves code, hovers and diagnostics', () => {
  const options = getTwoslashOptions();
  const reference = {
    compilerOptions: { ...TWOSLASH_COMPILER_OPTIONS },
    handbookOptions: { ...TWOSLASH_HANDBOOK_OPTIONS },
    extraFiles: getTwoslashExtraFiles(),
  };
  for (const source of snippets) {
    const expected = twoslasher(source, 'ts', reference);
    // The render plugin creates a fresh factory per snippet, sharing these maps.
    const actual = createTwoslasher(options)(source, 'ts', options);
    finishTwoslashRun(options);
    expect(actual.code).toBe(expected.code);
    expect(actual.nodes).toEqual(expected.nodes);
  }
}, 30_000);

test('successive SDK snippets reuse the parsed declaration instead of blanking it', () => {
  const options = getTwoslashOptions();
  const sources: unknown[] = [];
  const compiler = createTwoslasher({
    ...options,
    shouldGetHoverInfo: () => {
      const environment = [...options.cache.values()][0];
      const source = environment.getSourceFile(sdkPath);
      if (source) sources.push(source);
      return true;
    },
  });
  compiler(snippets[0], 'ts', options);
  finishTwoslashRun(options);
  const sourceFile = sources[0];
  expect(sourceFile).toBeDefined();
  expect(options.fsMap.get(sdkPath)?.length).toBeGreaterThan(1_000);
  sources.length = 0;
  compiler(snippets[1], 'ts', options);
  finishTwoslashRun(options);
  expect(sources[0]).toBe(sourceFile);
}, 30_000);

test('failed and overridden virtual files cannot poison later snippets', () => {
  const options = getTwoslashOptions();
  const compiler = createTwoslasher(options);
  const original = options.fsMap.get(sdkPath);
  compiler(snippets[0], 'ts', options);
  // Emulate interrupted cleanup after a failed multi-file snippet.
  options.fsMap.set('/leaked.ts', 'declare const leaked: string;');
  options.fsMap.set(sdkPath, '');
  finishTwoslashRun(options, true);
  expect(options.cache.size).toBe(0);
  expect(options.fsMap.has('/leaked.ts')).toBe(false);
  expect(options.fsMap.get(sdkPath)).toBe(original);
  expect(compiler(snippets[0], 'ts', options).errors).toEqual([]);
  finishTwoslashRun(options);
  expect(compiler('leaked;', 'ts', options).errors.map(({ code }) => code)).toContain(2304);
  finishTwoslashRun(options);

  compiler('// @filename: .aspire/modules/aspire.mts\nexport const replacement = true;', 'ts', options);
  finishTwoslashRun(options);
  expect(options.fsMap.get(sdkPath)).toBe(original);
  expect(options.cache.size).toBe(0);
  expect(compiler(snippets[0], 'ts', options).errors).toEqual([]);
}, 30_000);

test('each invocation owns fresh filesystem and compiler caches', () => {
  const first = getTwoslashOptions();
  const second = getTwoslashOptions();
  first.fsMap.set(sdkPath, 'changed');
  expect(second.fsMap.get(sdkPath)).not.toBe('changed');
  expect(first.cache).not.toBe(second.cache);
  expect(first.fsMap).not.toBe(second.fsMap);
});
