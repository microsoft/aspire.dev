/**
 * Compiles every `twoslash`-annotated TypeScript code block in
 * `src/content/docs/**` and asserts that the only remaining diagnostics
 * are documented type-bugs in `aspire.d.ts`. The audit logic lives in
 * the `twoslash-blocks-audit.ts` sibling helper.
 *
 * Gated on the shared `TWOSLASH_ENABLED` flag: when twoslash is disabled
 * site-wide, the suite is skipped (render and audit stay in lock-step).
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { TWOSLASH_ENABLED } from '../../config/twoslash.config.mjs';
import {
  KNOWN_TYPE_BUGS,
  countKnownBugOccurrences,
  filterUnexpectedDiagnostics,
  findKnownBug,
  runAudit,
  type AuditReport,
  type BlockResult,
} from './twoslash-blocks-audit.ts';

let report: AuditReport;
let unexpected: BlockResult[];

beforeAll(() => {
  report = runAudit();
  unexpected = filterUnexpectedDiagnostics(report);
}, 240_000);

describe.skipIf(!TWOSLASH_ENABLED)('twoslash code blocks', () => {
  test('every twoslash block compiles or is in the KNOWN_TYPE_BUGS allowlist', () => {
    if (unexpected.length === 0) {
      expect(unexpected).toHaveLength(0);
      return;
    }

    const lines: string[] = [
      `Found ${unexpected.reduce(
        (sum, r) => sum + r.diagnostics.length + (r.crashed ? 1 : 0),
        0
      )} unexpected diagnostic(s) in ${unexpected.length} block(s):`,
      '',
    ];
    for (const r of unexpected) {
      if (r.crashed) {
        lines.push(
          `  ✖ ${r.location.page} block #${r.location.blockIndex} — harness crash: ${r.crashMessage}`
        );
        continue;
      }
      for (const d of r.diagnostics) {
        lines.push(
          `  ✖ ${r.location.page}:${d.mdxLine}:${d.column} (block #${r.location.blockIndex}) ts(${d.code}) — ${d.message.split('\n')[0]}`
        );
      }
    }
    lines.push('');
    lines.push(
      'Either fix the docs to compile, or — if this is a real type-shape gap —'
    );
    lines.push(
      'add an entry to KNOWN_TYPE_BUGS in tests/unit/twoslash-blocks-audit.ts'
    );
    lines.push('and document it in artifacts/type-bug-findings.md.');
    throw new Error(lines.join('\n'));
  });

  test('audit walked at least 100 twoslash blocks', () => {
    // Sanity check — guards against the harness silently filtering everything
    // out (e.g. if the fence regex regresses).
    expect(report.blocksScanned).toBeGreaterThanOrEqual(100);
  });

  test('every KNOWN_TYPE_BUGS entry matches the expected occurrence count', () => {
    // Two failure modes are caught here:
    //  1. Stale entry — upstream fix landed in `aspire.d.ts`, so the entry
    //     no longer matches anything (count = 0) and can be removed.
    //  2. Silently-swallowed regression — block grew a new error of the
    //     same shape; the broad allowlist would otherwise hide it, but we
    //     assert count equals `expectedOccurrences` so extras surface here.
    const issues: string[] = [];
    const counts = countKnownBugOccurrences(report);
    for (const kb of KNOWN_TYPE_BUGS) {
      const actual = counts.get(kb) ?? 0;
      const expected = kb.expectedOccurrences ?? 1;
      if (actual !== expected) {
        issues.push(
          `  • ${kb.page} block #${kb.blockIndex} ts(${kb.code}) "${kb.label}" — expected ${expected}, found ${actual}`
        );
      }
    }
    if (issues.length > 0) {
      throw new Error(
        `KNOWN_TYPE_BUGS has ${issues.length} mismatched entr${issues.length === 1 ? 'y' : 'ies'}:\n` +
          issues.join('\n') +
          '\n\nUpdate the entry (or remove it) in tests/unit/twoslash-blocks-audit.ts.'
      );
    }
  });

  test('findKnownBug matches by all four fields', () => {
    // Cheap sanity check on the allowlist matcher itself.
    if (KNOWN_TYPE_BUGS.length === 0) return;
    const sample = KNOWN_TYPE_BUGS[0];
    const matched = findKnownBug(sample.page, sample.blockIndex, {
      code: sample.code,
      message: `prefix ${sample.messageContains} suffix`,
      mdxLine: 0,
      column: 0,
      blockLine: 0,
    });
    expect(matched).toBe(sample);

    // Wrong page → no match.
    const wrongPage = findKnownBug('definitely/not/a/page.mdx', sample.blockIndex, {
      code: sample.code,
      message: sample.messageContains,
      mdxLine: 0,
      column: 0,
      blockLine: 0,
    });
    expect(wrongPage).toBeUndefined();
  });
});
