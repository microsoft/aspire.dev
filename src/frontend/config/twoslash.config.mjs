/**
 * twoslash.config.mjs — single source of truth for the
 * `expressive-code-twoslash` configuration used to compile docs TS samples.
 *
 * Both `ec.config.mjs` (renders the site) and
 * `tests/unit/twoslash-blocks-audit.ts` (audits every block in CI / dev) import
 * from here so the two pipelines can never disagree on which compiler
 * options or virtual-file shims are in play.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
/** @type {WeakMap<Map<string, string>, Map<string, string>>} */
const initialFiles = new WeakMap();

/** Path to the generated Aspire SDK declaration bundle. */
export const ASPIRE_TYPES_PATH = resolve(
  __dirname,
  '..',
  'src',
  'data',
  'twoslash',
  'aspire.d.ts'
);

/**
 * Languages whose code fences participate in twoslash. Keep in sync with the
 * `instanceConfigs.twoslash.languages` value passed to `ecTwoSlash`.
 */
export const TWOSLASH_LANGUAGES = ['ts', 'tsx', 'typescript'];

/**
 * Master switch — flip to `false` to disable twoslash everywhere (renders +
 * audit) without ripping the wiring out of the site config.
 */
export const TWOSLASH_ENABLED = true;

/**
 * TypeScript compiler options applied to every twoslash block. The numeric
 * values mirror the corresponding TS enum members (avoids importing the
 * `typescript` package from `ec.config.mjs`).
 *
 * - `moduleResolution: 100` → `ts.ModuleResolutionKind.Bundler` so
 *   `./.aspire/modules/aspire.mjs` falls through to the virtual
 *   `.aspire/modules/aspire.mts`.
 * - `module: 99` → `ts.ModuleKind.ESNext` (paired with bundler resolution).
 * - `target: 99` → `ts.ScriptTarget.ESNext` so `lib.esnext.full.d.ts` is the
 *   default `lib`, pulling in `Date`, `URL`, DOM, and friends via TS's
 *   triple-slash references.
 */
export const TWOSLASH_COMPILER_OPTIONS = Object.freeze({
  moduleResolution: 100,
  module: 99,
  target: 99,
  strict: true,
  noEmit: true,
});

/**
 * Twoslash handbook options. We keep `noErrorValidation: true` so an
 * unannotated TS error in a sample doesn't crash the twoslash pass on the
 * first stale sample. The strict audit test collects every diagnostic and
 * fails if any block would render an error UX.
 */
export const TWOSLASH_HANDBOOK_OPTIONS = Object.freeze({
  noErrorValidation: true,
});

/**
 * Loads the `aspire.d.ts` bundle. Returns the raw source string and a
 * boolean indicating whether the file exists. Callers can decide whether a
 * missing bundle is fatal.
 */
export function readAspireTypes() {
  const exists = existsSync(ASPIRE_TYPES_PATH);
  const source = exists ? readFileSync(ASPIRE_TYPES_PATH, 'utf8') : '';
  return { exists, source };
}

/**
 * Returns the `extraFiles` map twoslash should mount in its VFS. Returns an
 * empty object when the SDK bundle is missing so twoslash can still compile
 * blocks that don't import from `./.aspire/modules/aspire.mjs` (they'll just see
 * `any` for the missing module — same fallback `ec.config.mjs` had inline).
 */
export function getTwoslashExtraFiles() {
  const { source } = readAspireTypes();
  return source ? { '.aspire/modules/aspire.mts': source } : {};
}

/**
 * Build a complete `TwoslashOptions` object suitable for either:
 * - `ecTwoSlash({ twoslashOptions })` (site rendering), or
 * - `createTwoslasher(opts)` from `@ec-ts/twoslash` (audit harness).
 *
 * Keep the SDK in the persistent VFS, not extraFiles: twoslash clears
 * extraFiles after every snippet, forcing TypeScript to reparse the entire
 * declaration bundle. Each options object owns its filesystem and TS cache.
 */
export function getTwoslashOptions() {
  const libDirectory = dirname(require.resolve('typescript'));
  /** @type {Map<string, string>} */
  const fsMap = new Map(
    readdirSync(libDirectory)
      .filter((name) => name.endsWith('.d.ts'))
      .map((name) => [`/${name}`, readFileSync(join(libDirectory, name), 'utf8')]),
  );
  for (const [name, source] of Object.entries(getTwoslashExtraFiles())) {
    fsMap.set(`/${name}`, source);
  }
  initialFiles.set(fsMap, new Map(fsMap));
  /** @type {Exclude<import('@ec-ts/twoslash').TwoslashOptions['cache'], boolean | undefined>} */
  const cache = new Map();
  return {
    compilerOptions: { ...TWOSLASH_COMPILER_OPTIONS },
    handbookOptions: { ...TWOSLASH_HANDBOOK_OPTIONS },
    fsMap,
    cache,
  };
}

/**
 * Failed snippets can bypass twoslash's virtual-file cleanup. Drop poisoned
 * environments, and restore SDK/lib files if a sample deliberately overrides
 * one with an @filename directive.
 * @param {ReturnType<typeof getTwoslashOptions>} options
 */
export function finishTwoslashRun(options, failed = false) {
  const original = initialFiles.get(options.fsMap);
  if (!original) return;
  let changed = failed;
  for (const [name, source] of original) {
    if (options.fsMap.get(name) !== source) {
      options.fsMap.set(name, source);
      changed = true;
    }
  }
  if (!changed) return;
  options.cache.clear();
  for (const name of options.fsMap.keys()) {
    if (!original.has(name)) options.fsMap.delete(name);
  }
}
