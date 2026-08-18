/**
 * Compiles every `twoslash`-annotated TypeScript code block in
 * `src/content/docs/**` and asserts that no block would render a TypeScript
 * diagnostic on the live site. The audit logic lives in the
 * `twoslash-blocks-audit.ts` sibling helper.
 *
 * Gated on the shared `TWOSLASH_ENABLED` flag: when twoslash is disabled
 * site-wide, the suite is skipped (render and audit stay in lock-step).
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { TWOSLASH_ENABLED } from '../../config/twoslash.config.mjs';
import {
  getRenderedFailureBlocks,
  runAudit,
  type AuditReport,
  type BlockResult,
} from './twoslash-blocks-audit.ts';

let report: AuditReport;
let unexpected: BlockResult[];

beforeAll(() => {
  report = runAudit();
  unexpected = getRenderedFailureBlocks(report);
}, 240_000);

describe.skipIf(!TWOSLASH_ENABLED)('twoslash code blocks', () => {
  test('every twoslash block renders without TypeScript diagnostics', () => {
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
      'Fix the sample, regenerate src/data/twoslash/aspire.d.ts if the SDK type data is stale,'
    );
    lines.push(
      'or remove the `twoslash` meta until the snippet compiles cleanly.'
    );
    lines.push('Do not suppress these failures: every diagnostic renders an error UX on aspire.dev.');
    throw new Error(lines.join('\n'));
  });

  test('audit walked at least 100 twoslash blocks', () => {
    // Sanity check — guards against the harness silently filtering everything
    // out (e.g. if the fence regex regresses).
    expect(report.blocksScanned).toBeGreaterThanOrEqual(100);
  });
});
