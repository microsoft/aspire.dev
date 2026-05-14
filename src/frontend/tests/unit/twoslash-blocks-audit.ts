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
 * `KNOWN_TYPE_BUGS` pins the diagnostics that are documented gaps in the
 * generated `aspire.d.ts` rather than doc-bugs we can fix; everything else
 * fails the test. Each entry carries an `expectedOccurrences` count so that
 * a new diagnostic of the same shape in the same block (e.g. a second
 * `IResource` error introduced by editing the snippet) still surfaces.
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

// ---------- known type-bugs allowlist ----------

/**
 * Diagnostics we deliberately allow because they are gaps in the *generated*
 * `aspire.d.ts`, not bugs in the doc snippet. Each entry pins a (page,
 * block #, ts code, message substring) tuple so a regression in either the
 * doc OR the type surface still surfaces as an unexpected diagnostic. The
 * test asserts that every entry still matches a real diagnostic, so stale
 * entries (e.g. an upstream fix landed) surface and can be pruned.
 */
export interface KnownTypeBug {
  /** docs-relative page path (forward slashes). */
  page: string;
  /** 1-indexed twoslash block index within the page. */
  blockIndex: number;
  /** TS error code. */
  code: number;
  /** Substring that must appear in the diagnostic message. */
  messageContains: string;
  /**
   * Exact number of diagnostics this entry is allowed to suppress for the
   * page+block. Defaults to 1. Extra diagnostics with the same signature
   * still surface as unexpected, which keeps the regression gate precise
   * when blocks gain new errors of the same shape.
   */
  expectedOccurrences?: number;
  /** Short tracking label for reporting. */
  label: string;
}

export const KNOWN_TYPE_BUGS: ReadonlyArray<KnownTypeBug> = [
  // 1. IResource merged-interface identity mismatch — ~10 sites
  {
    page: 'app-host/container-registry.mdx',
    blockIndex: 7,
    code: 2345,
    messageContains: "'AzureContainerRegistryResource' is not assignable to parameter of type 'IResource'",
    label: 'IResource identity (withReference + ACR)',
  },
  {
    page: 'integrations/cloud/azure/azure-ai-foundry/azure-ai-foundry-host.mdx',
    blockIndex: 5,
    code: 2345,
    messageContains: "'AzureContainerRegistryResource' is not assignable to parameter of type 'IResource'",
    label: 'IResource identity (withContainerRegistry + ACR)',
  },
  {
    page: 'integrations/cloud/azure/azure-openai/azure-openai-host.mdx',
    blockIndex: 1,
    code: 2345,
    messageContains: "'AzureOpenAIDeploymentResource' is not assignable to parameter of type 'IResource'",
    label: 'IResource identity (withReference + AOAI deployment)',
  },
  {
    page: 'integrations/cloud/azure/azure-openai/azure-openai-host.mdx',
    blockIndex: 2,
    code: 2345,
    messageContains: "'AzureOpenAIDeploymentResource' is not assignable to parameter of type 'IResource'",
    expectedOccurrences: 2,
    label: 'IResource identity (withReference + AOAI deployment)',
  },
  {
    page: 'integrations/cloud/azure/azure-openai/azure-openai-host.mdx',
    blockIndex: 3,
    code: 2345,
    messageContains: "'AzureOpenAIDeploymentResource' is not assignable to parameter of type 'IResource'",
    label: 'IResource identity (withReference + AOAI deployment)',
  },
  {
    page: 'integrations/cloud/azure/azure-openai/azure-openai-host.mdx',
    blockIndex: 5,
    code: 2345,
    messageContains: "'AzureOpenAIDeploymentResource' is not assignable to parameter of type 'IResource'",
    label: 'IResource identity (withReference + AOAI deployment)',
  },
  {
    page: 'whats-new/aspire-13-2.mdx',
    blockIndex: 6,
    code: 2345,
    messageContains: "is not assignable to parameter of type 'IResource'",
    expectedOccurrences: 2,
    label: 'IResource identity (waitFor + ADLS)',
  },
  {
    page: 'ja/whats-new/aspire-13-2.mdx',
    blockIndex: 6,
    code: 2345,
    messageContains: "is not assignable to parameter of type 'IResource'",
    expectedOccurrences: 2,
    label: 'IResource identity (waitFor + ADLS)',
  },

  // 2. AzureResourceInfrastructure.getProvisionableResources() missing
  {
    page: 'integrations/cloud/azure/azure-openai/azure-openai-host.mdx',
    blockIndex: 6,
    code: 2339,
    messageContains: "Property 'getProvisionableResources' does not exist on type 'AzureResourceInfrastructure'",
    label: 'getProvisionableResources missing',
  },
  {
    page: 'integrations/cloud/azure/customize-resources.mdx',
    blockIndex: 4,
    code: 2339,
    messageContains: "Property 'getProvisionableResources' does not exist on type 'AzureResourceInfrastructure'",
    label: 'getProvisionableResources missing',
  },

  // 3. YarpResource.addRoute(path, EndpointReference) overload missing
  {
    page: 'deployment/javascript-apps.mdx',
    blockIndex: 2,
    code: 2345,
    messageContains: "'EndpointReference' is not assignable to parameter of type 'string | ExternalServiceResource'",
    label: 'addRoute(path, EndpointReference) overload missing',
  },

  // 4. GitHubModelName literal union outdated
  {
    page: 'integrations/cloud/azure/ai-compatibility-matrix.mdx',
    blockIndex: 4,
    code: 2769,
    messageContains: "'\"openai/gpt-4o-mini\"' is not assignable to parameter of type 'GitHubModelName'",
    label: 'GitHubModelName literal union outdated',
  },
];

/** Match a diagnostic against the allowlist. */
export function findKnownBug(
  page: string,
  blockIndex: number,
  diagnostic: BlockDiagnostic
): KnownTypeBug | undefined {
  return KNOWN_TYPE_BUGS.find(
    (kb) =>
      kb.page === page &&
      kb.blockIndex === blockIndex &&
      kb.code === diagnostic.code &&
      diagnostic.message.includes(kb.messageContains)
  );
}

/**
 * Returns only the diagnostics that are NOT in the known-type-bug allowlist.
 * The vitest test uses this to enforce zero unexpected errors while still
 * accepting the documented type-shape gaps.
 *
 * Per-block, per-bug "budgets" are consumed greedily: each entry suppresses
 * at most `expectedOccurrences` (default 1) matching diagnostics. Extras
 * surface as unexpected so introducing a new error of the same shape in an
 * allowlisted block still fails the test.
 */
export function filterUnexpectedDiagnostics(report: AuditReport): BlockResult[] {
  const out: BlockResult[] = [];
  for (const r of report.results) {
    if (r.crashed) {
      out.push(r);
      continue;
    }

    const budget = new Map<KnownTypeBug, number>();
    for (const kb of KNOWN_TYPE_BUGS) {
      if (
        kb.page === r.location.page &&
        kb.blockIndex === r.location.blockIndex
      ) {
        budget.set(kb, kb.expectedOccurrences ?? 1);
      }
    }

    const unexpected: BlockDiagnostic[] = [];
    for (const d of r.diagnostics) {
      let consumed = false;
      for (const [kb, remaining] of budget) {
        if (
          remaining > 0 &&
          kb.code === d.code &&
          d.message.includes(kb.messageContains)
        ) {
          budget.set(kb, remaining - 1);
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        unexpected.push(d);
      }
    }

    if (unexpected.length > 0) {
      out.push({ ...r, diagnostics: unexpected });
    }
  }
  return out;
}

/**
 * Counts how many diagnostics in `report` match each known-type-bug entry.
 * Used by the vitest "every entry still matches a real diagnostic" test to
 * detect both stale entries (count of zero) AND silently-swallowed new
 * errors (count greater than `expectedOccurrences`).
 */
export function countKnownBugOccurrences(
  report: AuditReport
): Map<KnownTypeBug, number> {
  const counts = new Map<KnownTypeBug, number>();
  for (const kb of KNOWN_TYPE_BUGS) counts.set(kb, 0);
  for (const r of report.results) {
    if (r.crashed) continue;
    for (const d of r.diagnostics) {
      for (const kb of KNOWN_TYPE_BUGS) {
        if (
          kb.page === r.location.page &&
          kb.blockIndex === r.location.blockIndex &&
          kb.code === d.code &&
          d.message.includes(kb.messageContains)
        ) {
          counts.set(kb, (counts.get(kb) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
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
      message: (e as { text?: string; renderedMessage?: string }).text
        ?? (e as { renderedMessage?: string }).renderedMessage
        ?? `(unknown ts(${e.code}) diagnostic)`,
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
    throw new Error(
      'aspire.d.ts is missing — run `pnpm twoslash-types` before auditing.'
    );
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

  const blocksWithErrors = results.filter(
    (r) => r.diagnostics.length > 0 || r.crashed
  ).length;
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
