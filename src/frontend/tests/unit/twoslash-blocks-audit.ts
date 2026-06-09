/**
 * twoslash-blocks-audit.ts
 *
 * Helper for `twoslash-blocks.vitest.test.ts`. Walks every `.mdx` file in
 * `src/content/docs/**`, extracts every TypeScript code block annotated with
 * the `twoslash` meta flag, and compiles each one with `@ec-ts/twoslash`
 * using the same options the live site renders with (sourced from
 * `config/twoslash.config.mjs` so render and audit can never disagree).
 *
 * `TWOSLASH_ENABLED` from the shared config is the master switch: when it is
 * flipped off, `runAudit()` short-circuits to an empty report so render and
 * audit stay in lock-step (no `aspire.d.ts` requirement, no scan).
 *
 * Any diagnostic collected here is a rendered failure on the live site. The
 * test suite intentionally has no allowlist: fix the snippet, regenerate the
 * type data, or remove the `twoslash` meta until the sample compiles.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep, posix, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { twoslasher } from '@ec-ts/twoslash';
import {
  TWOSLASH_ENABLED,
  TWOSLASH_LANGUAGES,
  getTwoslashOptions,
  readAspireTypes,
} from '../../config/twoslash.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(__dirname, '..', '..');
const DOCS_ROOT = resolve(FRONTEND_ROOT, 'src', 'content', 'docs');

// ---------- types ----------

export interface BlockLocation {
  /** docs-relative path with forward slashes (e.g. `deployment/environments.mdx`). */
  page: string;
  /** absolute path to the `.mdx` source. */
  absPath: string;
  /** 1-indexed line number of the opening fence (` ```ts twoslash `). */
  fenceLine: number;
  /** 1-indexed line number of the closing fence. */
  closingFenceLine: number;
  /** language token from the fence (`ts` | `typescript` | `tsx`). */
  lang: string;
  /** raw meta string after the language token (everything before the newline). */
  meta: string;
  /** sequence number of this block within the file (1-indexed). */
  blockIndex: number;
}

export interface BlockDiagnostic {
  /** TS error code (e.g. 2345). */
  code: number;
  /** Rendered diagnostic text. */
  message: string;
  /** 1-indexed line within the .mdx (NOT within the block). */
  mdxLine: number;
  /** 1-indexed column within the source line. */
  column: number;
  /** 1-indexed line within the code block (for context). */
  blockLine: number;
}

export interface BlockResult {
  location: BlockLocation;
  /** Source code passed to twoslash (post-extraction). */
  source: string;
  diagnostics: BlockDiagnostic[];
  /** True if the audit harness itself crashed compiling this block. */
  crashed?: boolean;
  crashMessage?: string;
}

export interface AuditReport {
  /** ISO timestamp the audit ran. */
  generatedAt: string;
  /**
   * Mirrors `TWOSLASH_ENABLED` from `config/twoslash.config.mjs` at the
   * moment of the run. When `false`, the audit short-circuited and the
   * other counters are all zero.
   */
  twoslashEnabled: boolean;
  /** Number of `.mdx` files scanned. */
  filesScanned: number;
  /** Number of twoslash blocks scanned. */
  blocksScanned: number;
  /** Number of blocks with at least one diagnostic. */
  blocksWithErrors: number;
  /** Total diagnostics across all blocks. */
  totalDiagnostics: number;
  results: BlockResult[];
}

// ---------- failure aggregation ----------

export function getRenderedFailureBlocks(report: AuditReport): BlockResult[] {
  return report.results.filter((r) => r.crashed || r.diagnostics.length > 0);
}

// ---------- block extraction ----------

const FENCE_OPEN = new RegExp(
  String.raw`^\s*\u0060{3,}(` + TWOSLASH_LANGUAGES.join('|') + String.raw`)\b([^\n]*)$`
);

/**
 * Pulls every twoslash code block out of an `.mdx` source. We only
 * recognize blocks whose meta string contains a standalone `twoslash`
 * token — same trigger expressive-code-twoslash uses (`explicitTrigger: true`).
 */
export function extractTwoslashBlocks(
  mdxSource: string,
  page: string,
  absPath: string
): Array<{ location: BlockLocation; source: string }> {
  const lines = mdxSource.split('\n');
  const blocks: Array<{ location: BlockLocation; source: string }> = [];

  let i = 0;
  let blockIndex = 0;
  while (i < lines.length) {
    const line = lines[i];
    const openMatch = FENCE_OPEN.exec(line);
    if (!openMatch) {
      i++;
      continue;
    }

    const lang = openMatch[1];
    const meta = openMatch[2] ?? '';

    // Determine the exact fence string used (number of backticks) so the
    // matching close fence can be longer than 3 backticks.
    const backticks = (line.match(/^\s*`+/)?.[0] ?? '```').trim();
    const fenceLine = i + 1;
    const isTwoslash = /\btwoslash\b/.test(meta);

    // Walk forward until we find a matching closing fence.
    let j = i + 1;
    while (j < lines.length) {
      const trimmed = lines[j].trimStart();
      if (trimmed.startsWith(backticks) && /^`+\s*$/.test(trimmed)) {
        break;
      }
      j++;
    }

    if (j >= lines.length) {
      // Unterminated fence — skip to avoid runaway loops.
      i++;
      continue;
    }

    if (isTwoslash) {
      blockIndex++;
      const bodyLines = lines.slice(i + 1, j);
      const source = bodyLines.join('\n');
      blocks.push({
        location: {
          page,
          absPath,
          fenceLine,
          closingFenceLine: j + 1,
          lang,
          meta: meta.trim(),
          blockIndex,
        },
        source,
      });
    }
    i = j + 1;
  }

  return blocks;
}

// ---------- compilation ----------

const sharedOptions = getTwoslashOptions();

function mapLangForTwoslash(lang: string): string {
  // `@ec-ts/twoslash` accepts `ts`/`tsx`; treat `typescript` as `ts`.
  if (lang === 'typescript') return 'ts';
  return lang;
}

function compileBlock(source: string, lang: string): BlockDiagnostic[] {
  const result = twoslasher(source, mapLangForTwoslash(lang), sharedOptions);
  return result.errors
    .filter((e) => e && typeof e.line === 'number')
    .map<BlockDiagnostic>((e) => ({
      code: e.code,
      // `@ec-ts/twoslash` puts the rendered diagnostic on `.text` (the
      // older `@typescript/twoslash` shape used `.renderedMessage`).
      message:
        (e as { text?: string; renderedMessage?: string }).text ??
        (e as { renderedMessage?: string }).renderedMessage ??
        `(unknown ts(${e.code}) diagnostic)`,
      // Will be remapped to mdx coordinates by the caller.
      mdxLine: 0,
      column: ((e.character as number | undefined) ?? 0) + 1,
      blockLine: ((e.line as number | undefined) ?? 0) + 1,
    }));
}

// ---------- main entry ----------

export function runAudit(): AuditReport {
  // Master switch: when twoslash is disabled site-wide, the audit has
  // nothing meaningful to say (the site renders no twoslash output). Return
  // an empty report so the vitest gate trivially passes and we don't
  // require a regenerated `aspire.d.ts`.
  if (!TWOSLASH_ENABLED) {
    return {
      generatedAt: new Date().toISOString(),
      twoslashEnabled: false,
      filesScanned: 0,
      blocksScanned: 0,
      blocksWithErrors: 0,
      totalDiagnostics: 0,
      results: [],
    };
  }

  const { exists } = readAspireTypes();
  if (!exists) {
    throw new Error('aspire.d.ts is missing — run `pnpm twoslash-types` before auditing.');
  }

  const filesAbs = walkMdx(DOCS_ROOT);
  filesAbs.sort();

  const results: BlockResult[] = [];
  let blocksScanned = 0;

  for (const absPath of filesAbs) {
    const mdxSource = readFileSync(absPath, 'utf8');
    const page = relative(DOCS_ROOT, absPath).split(sep).join(posix.sep);
    const blocks = extractTwoslashBlocks(mdxSource, page, absPath);
    for (const { location, source } of blocks) {
      blocksScanned++;
      let diagnostics: BlockDiagnostic[] = [];
      let crashed = false;
      let crashMessage: string | undefined;
      try {
        diagnostics = compileBlock(source, location.lang);
      } catch (err) {
        crashed = true;
        crashMessage = err instanceof Error ? err.message : String(err);
      }

      // Remap diagnostic positions from block-local lines to .mdx lines.
      // Block body starts at fenceLine + 1 (the line after the fence).
      const blockBodyStart = location.fenceLine + 1;
      for (const d of diagnostics) {
        d.mdxLine = blockBodyStart + (d.blockLine - 1);
      }

      results.push({ location, source, diagnostics, crashed, crashMessage });
    }
  }

  const blocksWithErrors = results.filter((r) => r.diagnostics.length > 0 || r.crashed).length;
  const totalDiagnostics = results.reduce((sum, r) => sum + r.diagnostics.length, 0);

  return {
    generatedAt: new Date().toISOString(),
    twoslashEnabled: true,
    filesScanned: filesAbs.length,
    blocksScanned,
    blocksWithErrors,
    totalDiagnostics,
    results,
  };
}

function walkMdx(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMdx(full));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      out.push(full);
    }
  }
  return out;
}
