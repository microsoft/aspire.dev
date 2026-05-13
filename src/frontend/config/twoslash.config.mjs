/**
 * twoslash.config.mjs — single source of truth for the
 * `expressive-code-twoslash` configuration used to compile docs TS samples.
 *
 * Both `ec.config.mjs` (renders the site) and
 * `tests/unit/twoslash-blocks-audit.ts` (audits every block in CI / dev) import
 * from here so the two pipelines can never disagree on which compiler
 * options or virtual-file shims are in play.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
 *   `./.modules/aspire.js` falls through to the virtual `.modules/aspire.ts`.
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
 * unannotated TS error in a sample doesn't *fail* the twoslash pass — the
 * site still renders the diagnostic, and the audit harness still surfaces
 * it. Without this, the build itself would crash on the first stale sample.
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
 * blocks that don't import from `./.modules/aspire.js` (they'll just see
 * `any` for the missing module — same fallback `ec.config.mjs` had inline).
 */
export function getTwoslashExtraFiles() {
  const { source } = readAspireTypes();
  return source ? { '.modules/aspire.ts': source } : {};
}

/**
 * Build a complete `TwoslashOptions` object suitable for either:
 * - `ecTwoSlash({ twoslashOptions })` (site rendering), or
 * - `twoslasher(code, lang, opts)` from `@ec-ts/twoslash` (audit harness).
 *
 * Returns a fresh object on every call so callers can mutate it without
 * leaking back into the shared frozen defaults.
 */
export function getTwoslashOptions() {
  return {
    compilerOptions: { ...TWOSLASH_COMPILER_OPTIONS },
    handbookOptions: { ...TWOSLASH_HANDBOOK_OPTIONS },
    extraFiles: getTwoslashExtraFiles(),
  };
}
